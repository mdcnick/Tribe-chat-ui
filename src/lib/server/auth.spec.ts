import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { cleanupTestData } from "./api/__tests__/testHelpers";

// auth.ts no longer uses Better Auth — PIN auth is the only auth method
vi.mock("./betterAuth", () => ({
	betterAuthEnabled: false,
	getBetterAuth: vi.fn(),
	mapBetterAuthUser: vi.fn(),
	setAuthSessionCookie: vi.fn(),
	clearAuthSessionCookie: vi.fn(),
	forwardBetterAuthCookies: vi.fn(),
}));

// Mock convoCrypto so tests don't need CONVERSATION_ENCRYPTION_KEY
vi.mock("./convoCrypto", () => ({
	initEncryption: () => ({
		salt: "dGVzdC1zYWx0",
		wrappedKey: "dGVzdC1rZXk",
		wrappedKeyIv: "dGVzdC1pdg==",
	}),
	cacheDek: vi.fn(),
	getDek: vi.fn(() => Buffer.from("a".repeat(32), "utf8")),
	encryptField: vi.fn((text: string) => `enc:${text}`),
	decryptField: vi.fn((text: string) => text.replace(/^enc:/, "")),
	isEncrypted: vi.fn((text: string) => text.startsWith("enc:")),
	deriveDek: vi.fn(),
	wrapDek: vi.fn(),
	unwrapDek: vi.fn(),
	evictDek: vi.fn(),
	cacheDekFromPin: vi.fn(),
}));

const { authenticateRequest } = await import("./auth");
const { registerWithPin, loginWithPin, generateUsername, hashPin, verifyPin } =
	await import("./pinAuth");

function createCookiesMock(): Cookies {
	return {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn(),
	} as unknown as Cookies;
}

describe("PIN Auth", () => {
	beforeEach(async () => {
		await cleanupTestData();
	});

	describe("generateUsername", () => {
		it("generates a username in adjective_noun_number format", async () => {
			const username = await generateUsername();
			expect(username).toMatch(/^[a-z]+_[a-z]+_\d{1,2}$/);
		});

		it("generates unique usernames", async () => {
			const names = new Set<string>();
			for (let i = 0; i < 20; i++) {
				names.add(await generateUsername());
			}
			expect(names.size).toBeGreaterThan(15);
		});
	});

	describe("hashPin and verifyPin", () => {
		it("hashes and verifies a PIN correctly", async () => {
			const hash = await hashPin("1234567890");
			expect(hash).toContain(":");
			expect(await verifyPin("1234567890", hash)).toBe(true);
			expect(await verifyPin("0987654321", hash)).toBe(false);
		});

		it("rejects malformed hashes", async () => {
			expect(await verifyPin("1234567890", "invalid")).toBe(false);
			expect(await verifyPin("1234567890", "")).toBe(false);
		});
	});

	describe("registerWithPin", () => {
		it("registers a user with a generated username", async () => {
			const result = await registerWithPin({ pin: "1234567890" });
			expect(result.user).toBeDefined();
			expect(result.user.username).toMatch(/^[a-z]+_[a-z]+_\d{1,2}$/);
			expect(result.user.authProvider).toBe("pin");
			expect(result.user.pinHash).toBeDefined();
			expect(result.sessionId).toBeDefined();
			expect(result.secretSessionId).toBeDefined();

			const session = await collections.sessions.findOne({
				sessionId: result.sessionId,
			});
			expect(session).not.toBeNull();
			expect(session?.userId.toString()).toBe(result.user._id.toString());
		});

		it("registers a user with a custom username", async () => {
			const result = await registerWithPin({ username: "testuser", pin: "5678901234" });
			expect(result.user.username).toBe("testuser");
		});

		it("rejects a taken username", async () => {
			await registerWithPin({ username: "taken", pin: "1111111111" });
			await expect(registerWithPin({ username: "taken", pin: "2222222222" })).rejects.toThrow(
				"Username already taken"
			);
		});

		it("accepts an optional email", async () => {
			const result = await registerWithPin({ pin: "4321098765", email: "test@example.com" });
			expect(result.user.email).toBe("test@example.com");
		});

		it("rejects a duplicate email", async () => {
			await registerWithPin({ pin: "1111111111", email: "dup@example.com" });
			await expect(
				registerWithPin({ pin: "2222222222", email: "dup@example.com" })
			).rejects.toThrow("Email already registered");
		});

		it("rejects invalid PINs", async () => {
			await expect(registerWithPin({ pin: "12" })).rejects.toThrow("PIN must be exactly 10 digits");
			await expect(registerWithPin({ pin: "123456789012" })).rejects.toThrow(
				"PIN must be exactly 10 digits"
			);
			await expect(registerWithPin({ pin: "abcdefghij" })).rejects.toThrow(
				"PIN must be exactly 10 digits"
			);
		});
	});

	describe("loginWithPin", () => {
		it("logs in with correct PIN", async () => {
			const { user: registered } = await registerWithPin({
				username: "login_test",
				pin: "9999999999",
			});
			const result = await loginWithPin("login_test", "9999999999");

			expect(result.user._id.toString()).toBe(registered._id.toString());
			expect(result.sessionId).toBeDefined();
		});

		it("rejects wrong PIN", async () => {
			await registerWithPin({ username: "wrong_pin", pin: "1111111111" });
			await expect(loginWithPin("wrong_pin", "2222222222")).rejects.toThrow(
				"Invalid username or PIN"
			);
		});

		it("rejects unknown username", async () => {
			await expect(loginWithPin("nonexistent", "1234567890")).rejects.toThrow(
				"Invalid username or PIN"
			);
		});
	});

	describe("authenticateRequest", () => {
		it("returns anonymous session when no cookie", async () => {
			const cookies = createCookiesMock();
			(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

			const result = await authenticateRequest(
				new Request("http://localhost/"),
				cookies,
				new URL("http://localhost/")
			);

			expect(result.user).toBeUndefined();
			expect(result.sessionId).toBeDefined();
		});

		it("restores session from cookie", async () => {
			const { secretSessionId } = await registerWithPin({
				username: "session_test",
				pin: "5555555555",
			});

			const { sha256 } = await import("$lib/utils/sha256");
			await sha256(secretSessionId);

			const cookies = createCookiesMock();
			(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue(secretSessionId);

			const result = await authenticateRequest(
				new Request("http://localhost/"),
				cookies,
				new URL("http://localhost/")
			);

			expect(result.user).toBeDefined();
			expect(result.user?.username).toBe("session_test");
		});
	});
});
