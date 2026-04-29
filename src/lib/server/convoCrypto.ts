import crypto from "crypto";
import { logger } from "$lib/server/logger";
import { config } from "$lib/server/config";

/**
 * Conversation encryption module.
 *
 * Uses AES-256-GCM for authenticated encryption. Each user's conversations
 * are encrypted with a key derived from their username + PIN (scrypt).
 *
 * A server-side KEK (Key Encryption Key) wraps the per-user key so we
 * can decrypt without requiring the PIN on every request. The wrapped key
 * is stored in the user document. The per-user DEK (Data Encryption Key)
 * is derived from PIN + username, then used to encrypt/decrypt conversation
 * content at the field level.
 *
 * Flow:
 *   1. User registers → derive DEK from PIN+username, generate randomsalt,
 *      wrap DEK with KEK, store {wrappedKey, salt, iv} in user document.
 *   2. User logs in → derive DEK from PIN+username, verify against wrapped DEK,
 *      store DEK in an in-memory cache keyed by userId for the session duration.
 *   3. Read conversation → look up cached DEK, decrypt relevant fields.
 *   4. Write conversation → look up cached DEK, encrypt relevant fields.
 *   5. PIN change → derive new DEK, re-encrypt wrapped key, re-encrypt all conversations.
 *
 * Anonymous users (no PIN) get no encryption — their conversations are stored
 * in plain text tied to their session cookie, same as before.
 */

// In-memory DEK cache: userId -> {dek: Buffer, expiresAt: number }
const dekCache = new Map<string, { dek: Buffer; expiresAt: number }>();

// DEK cache TTL: 2 hours
const DEK_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// Scrypt parameters for key derivation
const SCRYPT_N = 16384; // Same as PIN auth — cost factor 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32; // 256 bits for AES-256

// AES-256-GCM parameters
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/** Get the server KEK from config. This MUST be set for encryption to work. */
function getKek(): Buffer {
	const kekHex = config.CONVERSATION_ENCRYPTION_KEY;
	if (!kekHex) {
		throw new Error(
			"CONVERSATION_ENCRYPTION_KEY env var is required for conversation encryption. " +
				"Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
		);
	}
	return Buffer.from(kekHex, "hex");
}

/** Derive a DEK from PIN + username using scrypt. */
export function deriveDek(pin: string, username: string, salt: Buffer): Buffer {
	// Derive key material from PIN + username with the given salt
	const keyMaterial = crypto.scryptSync(pin, `${username}:${salt.toString("hex")}`, KEY_LENGTH, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
	});

	// Combine with salt-based derivation for additional entropy
	return crypto.createHash("sha256").update(keyMaterial).update(salt).digest();
}

/** Wrap (encrypt) a DEK with the server KEK. Used to store DEK without needing PIN. */
export function wrapDek(dek: Buffer): { wrappedKey: string; iv: string } {
	const kek = getKek();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, kek, iv);
	const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return {
		wrappedKey: Buffer.concat([encrypted, authTag]).toString("base64url"),
		iv: iv.toString("base64url"),
	};
}

/** Unwrap (decrypt) a DEK with the server KEK. Used to recover DEK without PIN. */
export function unwrapDek(wrappedKey: string, iv: string): Buffer {
	const kek = getKek();
	const ivBuf = Buffer.from(iv, "base64url");
	const data = Buffer.from(wrappedKey, "base64url");
	const encrypted = data.subarray(0, data.length - AUTH_TAG_LENGTH);
	const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
	const decipher = crypto.createDecipheriv(ALGORITHM, kek, ivBuf);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Initialize encryption for a new user: derive DEK from PIN+username,
 * wrap it with KEK, and return the wallet data to store on the user.
 */
export function initEncryption(
	pin: string,
	username: string
): {
	salt: string;
	wrappedKey: string;
	wrappedKeyIv: string;
} {
	const salt = crypto.randomBytes(32);
	const dek = deriveDek(pin, username, salt);

	const { wrappedKey, iv } = wrapDek(dek);

	return {
		salt: salt.toString("base64url"),
		wrappedKey,
		wrappedKeyIv: iv,
	};
}

/**
 * Get the DEK for a user. Tries the in-memory cache first, then
 * unwraps from stored wrapped key. Caches the result.
 *
 * For PIN-authenticated users logging in, prefer calling cacheDekFromPin()
 * instead, which validates the PIN-derived key against the stored wrapped key.
 */
export function getDek(userId: string): Buffer | null {
	const cached = dekCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.dek;
	}
	// Cannot derive without PIN — caller must use cacheDekFromPin or
	// cacheDekFromWrapped if they have the user's encryption wallet.
	return null;
}

/**
 * Derive DEK from PIN + username, validate it against the stored wrapped key,
 * and cache it. Called during login.
 *
 * Returns true if the DEK was successfully derived and cached.
 * Returns false if the user has no encryption wallet (shouldn't happen for PIN users).
 */
export function cacheDekFromPin(
	userId: string,
	pin: string,
	username: string,
	salt: string,
	wrappedKey: string,
	wrappedKeyIv: string
): boolean {
	const saltBuf = Buffer.from(salt, "base64url");
	const dek = deriveDek(pin, username, saltBuf);

	// Validate: unwrap the stored key and compare
	const storedDek = unwrapDek(wrappedKey, wrappedKeyIv);
	if (!crypto.timingSafeEqual(dek, storedDek)) {
		// Wrong PIN or corrupted data
		return false;
	}

	dekCache.set(userId, { dek, expiresAt: Date.now() + DEK_CACHE_TTL_MS });
	return true;
}

/**
 * Cache DEK from already-unwrapped key data. Used when we've already
 * validated the PIN during login.
 */
export function cacheDek(
	userId: string,
	salt: string,
	wrappedKey: string,
	wrappedKeyIv: string
): void {
	const dek = unwrapDek(wrappedKey, wrappedKeyIv);
	dekCache.set(userId, { dek, expiresAt: Date.now() + DEK_CACHE_TTL_MS });
}

/** Remove a user's DEK from the cache (on logout). */
export function evictDek(userId: string): void {
	dekCache.delete(userId);
}

/**
 * Encrypt a string field. Returns `{ ciphertext, iv }` as base64url strings.
 * Returns the original string if no DEK is available (anonymous users).
 */
export function encryptField(plaintext: string, userId: string): string | null {
	const dek = getDek(userId);
	if (!dek) return null; // null means "store plaintext"

	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:ciphertext (all base64url)
	return `${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/**
 * Decrypt a field that was encrypted by encryptField.
 * Returns the decrypted string, or the original string if it's not encrypted.
 */
export function decryptField(ciphertext: string, userId: string): string {
	const dek = getDek(userId);
	if (!dek) {
		// No DEK in cache — if this looks encrypted, we have a problem
		// (user session expired without re-login). Return the ciphertext
		// and let the caller handle it.
		logger.warn({ userId }, "No DEK available for decryption");
		return ciphertext;
	}

	// Check if this looks like an encrypted field (iv:authTag:ciphertext format)
	const parts = ciphertext.split(":");
	if (parts.length !== 3) {
		// Not encrypted — plaintext (anonymous user data or data from before encryption)
		return ciphertext;
	}

	const [ivB64, authTagB64, encryptedB64] = parts;

	try {
		const iv = Buffer.from(ivB64, "base64url");
		const authTag = Buffer.from(authTagB64, "base64url");
		const encrypted = Buffer.from(encryptedB64, "base64url");

		const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
		decipher.setAuthTag(authTag);

		return decipher.update(encrypted) + decipher.final("utf8");
	} catch (err) {
		logger.error({ err: String(err), userId }, "Failed to decrypt field");
		return ciphertext; // Return as-is (might be corrupted or wrong key)
	}
}

/**
 * Check if a string looks like an encrypted field.
 * Encrypted fields have the format: base64url:base64url:base64url
 */
export function isEncrypted(value: string): boolean {
	const parts = value.split(":");
	return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
