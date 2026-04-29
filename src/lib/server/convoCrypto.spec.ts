import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";

// Must mock config before importing convoCrypto
vi.mock("$lib/server/config", () => ({
	config: {
		CONVERSATION_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
	},
	ready: Promise.resolve(),
}));

// Must mock database before importing
vi.mock("$lib/server/database", () => ({
	collections: {},
}));

import {
	deriveDek,
	wrapDek,
	unwrapDek,
	encryptField,
	decryptField,
	isEncrypted,
	initEncryption,
	cacheDek,
	getDek,
	evictDek,
} from "$lib/server/convoCrypto";

describe("convoCrypto", () => {
	describe("deriveDek", () => {
		it("produces a deterministic 32-byte key from PIN + username + salt", () => {
			const salt = crypto.randomBytes(32);
			const key1 = deriveDek("1234", "testuser", salt);
			const key2 = deriveDek("1234", "testuser", salt);

			expect(key1).toHaveLength(32);
			expect(key1).toEqual(key2); // Same inputs = same key
		});

		it("produces different keys for different PINs", () => {
			const salt = crypto.randomBytes(32);
			const key1 = deriveDek("1234", "testuser", salt);
			const key2 = deriveDek("5678", "testuser", salt);

			expect(key1).not.toEqual(key2);
		});

		it("produces different keys for different usernames", () => {
			const salt = crypto.randomBytes(32);
			const key1 = deriveDek("1234", "user_a", salt);
			const key2 = deriveDek("1234", "user_b", salt);

			expect(key1).not.toEqual(key2);
		});

		it("produces different keys for different salts", () => {
			const salt1 = crypto.randomBytes(32);
			const salt2 = crypto.randomBytes(32);
			const key1 = deriveDek("1234", "testuser", salt1);
			const key2 = deriveDek("1234", "testuser", salt2);

			expect(key1).not.toEqual(key2);
		});
	});

	describe("wrapDek / unwrapDek", () => {
		it("round-trips a DEK through wrap/unwrap", () => {
			const dek = crypto.randomBytes(32);
			const { wrappedKey, iv } = wrapDek(dek);
			const unwrapped = unwrapDek(wrappedKey, iv);

			expect(unwrapped).toEqual(dek);
		});

		it("fails to unwrap with wrong KEK", () => {
			const dek = crypto.randomBytes(32);
			const { wrappedKey } = wrapDek(dek);
			// Wrapping produces different ciphertext each time due to random IV
			const { wrappedKey: wrappedKey2 } = wrapDek(dek);
			expect(wrappedKey).not.toEqual(wrappedKey2);
		});
	});

	describe("encryptField / decryptField", () => {
		it("round-trips a string through encrypt/decrypt with cached DEK", () => {
			const userId = "test-round-trip-user";
			const wallet = initEncryption("1234", "testuser");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			const plaintext = "Hello, this is a secret message!";
			const encrypted = encryptField(plaintext, userId);
			expect(encrypted).not.toBeNull();
			expect(encrypted).not.toEqual(plaintext);
			expect(isEncrypted(encrypted as string)).toBe(true);

			const decrypted = decryptField(encrypted as string, userId);
			expect(decrypted).toEqual(plaintext);
		});

		it("handles empty strings", () => {
			const userId = "test-empty-string-user";
			const wallet = initEncryption("1234", "testuser2");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			const encrypted = encryptField("", userId);
			expect(encrypted).not.toBeNull();

			const decrypted = decryptField(encrypted as string, userId);
			expect(decrypted).toEqual("");
		});

		it("handles unicode content", () => {
			const userId = "test-unicode-user";
			const wallet = initEncryption("1234", "testuser3");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			const plaintext = "你好世界 🌍 مرحبا";
			const encrypted = encryptField(plaintext, userId);
			const decrypted = decryptField(encrypted as string, userId);
			expect(decrypted).toEqual(plaintext);
		});

		it("returns null when no DEK is cached (anonymous user)", () => {
			const result = encryptField("hello", "unknown-user");
			expect(result).toBeNull();
		});
	});

	describe("initEncryption", () => {
		it("creates an encryption wallet with valid base64url fields", () => {
			const wallet = initEncryption("1234", "newuser");

			expect(wallet.salt).toBeDefined();
			expect(wallet.wrappedKey).toBeDefined();
			expect(wallet.wrappedKeyIv).toBeDefined();

			// All fields should be valid base64url
			expect(() => Buffer.from(wallet.salt, "base64url")).not.toThrow();
			expect(() => Buffer.from(wallet.wrappedKey, "base64url")).not.toThrow();
			expect(() => Buffer.from(wallet.wrappedKeyIv, "base64url")).not.toThrow();
		});

		it("creates different wallets for different users", () => {
			const wallet1 = initEncryption("1234", "user_a");
			const wallet2 = initEncryption("1234", "user_b");

			expect(wallet1.salt).not.toEqual(wallet2.salt);
		});
	});

	describe("DEK cache", () => {
		it("caches and retrieves a DEK", () => {
			const userId = "test-cache-user";
			const wallet = initEncryption("1234", "cachinguser");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			const dek = getDek(userId);
			expect(dek).not.toBeNull();
			expect(dek).toHaveLength(32);
		});

		it("evicts a DEK from cache", () => {
			const userId = "test-evict-user";
			const wallet = initEncryption("1234", "evictuser");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			expect(getDek(userId)).not.toBeNull();
			evictDek(userId);
			expect(getDek(userId)).toBeNull();
		});
	});

	describe("isEncrypted", () => {
		it("detects encrypted strings", () => {
			const userId = "test-is-enc-user";
			const wallet = initEncryption("1234", "encuser");
			cacheDek(userId, wallet.salt, wallet.wrappedKey, wallet.wrappedKeyIv);

			const encrypted = encryptField("hello", userId) as string;
			expect(isEncrypted(encrypted)).toBe(true);
			expect(isEncrypted("hello world")).toBe(false);
		});
	});
});
