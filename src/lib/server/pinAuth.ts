import crypto from "crypto";
import { collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import type { User } from "$lib/types/User";
import { ObjectId } from "mongodb";
import { sha256 } from "$lib/utils/sha256";
import { initEncryption, cacheDek, cacheDekFromPin } from "$lib/server/convoCrypto";
import { generateRecoveryPhrase, hashRecoveryPhrase } from "$lib/server/recoveryKey";

// --- Adjective-noun random username generator ---

const ADJECTIVES = [
	"swift",
	"bold",
	"calm",
	"keen",
	"wild",
	"warm",
	"cool",
	"dark",
	"fair",
	"gray",
	"iron",
	"jade",
	"lime",
	"neon",
	"pale",
	"rose",
	"rust",
	"sage",
	"teal",
	"vast",
	"amber",
	"blaze",
	"cedar",
	"dusk",
	"frost",
	"hazel",
	"ivory",
	"maple",
	"onyx",
	"pixel",
	"quartz",
	"solar",
	"lucky",
	"happy",
	"brave",
	"quiet",
	"shy",
	"bright",
	"soft",
	"quick",
	"sly",
	"gentle",
	"stout",
	"nimble",
	"clever",
	"witty",
	"steady",
	"solid",
	"azure",
	"coral",
	"indigo",
	"mossy",
	"stormy",
	"sunny",
	"crisp",
	"deep",
	"cozy",
	"dreamy",
	"fluffy",
	"mellow",
	"peppy",
	"zippy",
	"dandy",
	"grand",
] as const;

const NOUNS = [
	"fox",
	"cat",
	"owl",
	"elk",
	"ray",
	"bee",
	"jay",
	"dog",
	"crow",
	"deer",
	"bear",
	"hawk",
	"wolf",
	"puma",
	"loon",
	"wren",
	"moose",
	"otter",
	"lynx",
	"dove",
	"panda",
	"raven",
	"tiger",
	"finch",
	"cobra",
	"heron",
	"bison",
	"robin",
	"squid",
	"whale",
	"camel",
	"eagle",
	"otter",
	"panda",
	"bunny",
	"puppy",
	"kitty",
	"pony",
	"fawn",
	" Cub",
	"seal",
	"swan",
	"crane",
	"heron",
	"stoat",
	"stoat",
	"shark",
	"dove",
	"turtle",
	"parrot",
	"jaguar",
	"falcon",
	"monkey",
	"gecko",
	"sparrow",
	"salamander",
] as const;

function randomFrom<T extends readonly string[]>(arr: T): string {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random username like "bold_fox_42".
 * Checks against existing usernames and retries if taken.
 */
export async function generateUsername(): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const adj = randomFrom(ADJECTIVES);
		const noun = randomFrom(NOUNS);
		const num = Math.floor(Math.random() * 100);
		const username = `${adj}_${noun}_${num}`;

		const existing = await collections.users.findOne({ username });
		if (!existing) return username;
	}
	// Fallback with UUID fragment
	return `user_${crypto.randomUUID().slice(0, 8)}`;
}

// --- PIN hashing ---

/**
 * Hash a PIN using scrypt (Node.js built-in, same approach as password hashing).
 * PINs are short so we use a higher cost to compensate.
 */
export async function hashPin(pin: string): Promise<string> {
	const salt = crypto.randomBytes(16).toString("hex");
	// scrypt with cost factor 2^14 (N=16384) — appropriate for short PINs
	const derived = await new Promise<Buffer>((resolve, reject) => {
		crypto.scrypt(pin, salt, 64, { N: 16384 }, (err, key) => {
			if (err) reject(err);
			else resolve(key);
		});
	});
	return `${salt}:${derived.toString("hex")}`;
}

/**
 * Verify a PIN against a stored hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
	const [salt, hashHex] = storedHash.split(":");
	if (!salt || !hashHex) return false;

	const derived = await new Promise<Buffer>((resolve, reject) => {
		crypto.scrypt(pin, salt, 64, { N: 16384 }, (err, key) => {
			if (err) reject(err);
			else resolve(key);
		});
	});

	return crypto.timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
}

// --- PIN auth: register and login ---

export interface PinAuthResult {
	user: User;
	sessionId: string;
	secretSessionId: string;
	recoveryPhrase: string; // 12-word recovery phrase - shown ONCE at registration
}

/**
 * Register a new user with an auto-generated username and a PIN.
 * Email is optional.
 */
export async function registerWithPin(options: {
	username?: string;
	pin: string;
	email?: string;
}): Promise<PinAuthResult> {
	const { pin, email } = options;
	// Validate PIN length (10 digits)
	if (!/^\d{10}$/.test(pin)) {
		throw new Error("PIN must be exactly 10 digits");
	}

	// Generate or validate username
	let username = options.username?.trim();
	if (!username) {
		username = await generateUsername();
	} else {
		// Check username availability
		const existing = await collections.users.findOne({ username });
		if (existing) {
			throw new Error("Username already taken");
		}
	}

	// Check if email is already registered (if provided)
	if (email) {
		const existingEmail = await collections.users.findOne({ email });
		if (existingEmail) {
			throw new Error("Email already registered");
		}
	}

	const pinHash = await hashPin(pin);
	const now = new Date();
	const userId = new ObjectId();

	// Derive encryption key from PIN+username and wrap with server KEK
	const encryption = initEncryption(pin, username);

	// Generate 12-word recovery phrase — shown ONCE to the user
	const recoveryPhrase = generateRecoveryPhrase();
	const recoveryPhraseHash = hashRecoveryPhrase(recoveryPhrase);

	const user: User = {
		_id: userId,
		username,
		name: username, // display name defaults to username
		email: email || undefined,
		avatarUrl: undefined,
		authProvider: "pin",
		authSubject: userId.toString(),
		pinHash,
		recoveryPhraseHash,
		encryption,
		createdAt: now,
		updatedAt: now,
	};

	await collections.users.insertOne(user);

	// Create session
	const secretSessionId = crypto.randomUUID();
	const sessionId = await sha256(secretSessionId);

	await collections.sessions.insertOne({
		_id: new ObjectId(),
		sessionId,
		userId,
		createdAt: now,
		updatedAt: now,
		expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
	});

	// Cache the DEK for the session so conversations can be en/decrypted
	cacheDek(userId.toString(), encryption.salt, encryption.wrappedKey, encryption.wrappedKeyIv);

	logger.info({ userId: userId.toString(), username }, "User registered via PIN");
	return { user, sessionId, secretSessionId, recoveryPhrase };
}

/**
 * Login with username + PIN.
 */
export async function loginWithPin(username: string, pin: string): Promise<PinAuthResult> {
	const user = await collections.users.findOne({ username });

	if (!user) {
		throw new Error("Invalid username or PIN");
	}

	if (!user.pinHash) {
		throw new Error("This account does not use PIN login");
	}

	const valid = await verifyPin(pin, user.pinHash);
	if (!valid) {
		throw new Error("Invalid username or PIN");
	}

	// Create new session
	const secretSessionId = crypto.randomUUID();
	const sessionId = await sha256(secretSessionId);
	const now = new Date();

	await collections.sessions.insertOne({
		_id: new ObjectId(),
		sessionId,
		userId: user._id,
		createdAt: now,
		updatedAt: now,
		expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
	});
	// Validate PIN-derived DEK against stored wrapped key and cache it
	if (user.encryption) {
		const validDek = cacheDekFromPin(
			user._id.toString(),
			pin,
			user.username,
			user.encryption.salt,
			user.encryption.wrappedKey,
			user.encryption.wrappedKeyIv
		);
		if (!validDek) {
			throw new Error("Invalid username or PIN");
		}
	}

	logger.info({ userId: user._id.toString(), username }, "User logged in via PIN");

	return { user, sessionId, secretSessionId, recoveryPhrase: "" }; // No recovery phrase on login
}
/**
 * Change a user's PIN.
 */
export async function changePin(
	userId: ObjectId,
	currentPin: string,
	newPin: string
): Promise<boolean> {
	const user = await collections.users.findOne({ _id: userId });

	if (!user || !user.pinHash) {
		return false;
	}

	const valid = await verifyPin(currentPin, user.pinHash);
	if (!valid) {
		return false;
	}

	if (!/^\d{10}$/.test(newPin)) {
		throw new Error("PIN must be exactly 10 digits");
	}

	const pinHash = await hashPin(newPin);
	await collections.users.updateOne({ _id: userId }, { $set: { pinHash, updatedAt: new Date() } });

	return true;
}
