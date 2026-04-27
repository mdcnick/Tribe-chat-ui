import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { cleanupTestData } from "./api/__tests__/testHelpers";

const getSessionMock = vi.fn();

vi.mock("./betterAuth", () => ({
	betterAuthEnabled: true,
	getBetterAuth: vi.fn(() =>
		Promise.resolve({
			api: {
				getSession: getSessionMock,
			},
		})
	),
	mapBetterAuthUser: (user: {
		id: string;
		email: string;
		name: string;
		image?: string | null;
	}) => ({
		authProvider: "better-auth" as const,
		authSubject: user.id,
		email: user.email,
		name: user.name,
		avatarUrl: user.image ?? undefined,
	}),
}));

const { authenticateRequest } = await import("./auth");

function createCookiesMock(): Cookies {
	return {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn(),
	} as unknown as Cookies;
}

describe("authenticateRequest with Better Auth", () => {
	beforeEach(async () => {
		await cleanupTestData();
		getSessionMock.mockReset();
	});

	it("creates a MongoDB user on the first authenticated request", async () => {
		getSessionMock.mockResolvedValue({
			user: {
				id: "ba_user_123",
				email: "test@example.com",
				name: "Test User",
				image: "https://example.com/avatar.png",
			},
			session: {
				id: "session_123",
				token: "token_abc",
			},
		});

		const cookies = createCookiesMock();
		const result = await authenticateRequest(
			new Request("http://localhost/"),
			cookies,
			new URL("http://localhost/")
		);

		const storedUser = await collections.users.findOne({
			authProvider: "better-auth",
			authSubject: "ba_user_123",
		});

		expect(storedUser).not.toBeNull();
		expect(storedUser).toMatchObject({
			authProvider: "better-auth",
			authSubject: "ba_user_123",
			email: "test@example.com",
			name: "Test User",
		});
		expect(result.user?._id.toString()).toBe(storedUser?._id.toString());
	});

	it("reuses the same MongoDB user on repeat authenticated requests", async () => {
		getSessionMock.mockResolvedValue({
			user: {
				id: "ba_user_123",
				email: "test@example.com",
				name: "Test User",
			},
			session: { id: "session_123", token: "token_abc" },
		});

		const firstCookies = createCookiesMock();
		await authenticateRequest(
			new Request("http://localhost/"),
			firstCookies,
			new URL("http://localhost/")
		);

		const secondCookies = createCookiesMock();
		await authenticateRequest(
			new Request("http://localhost/"),
			secondCookies,
			new URL("http://localhost/")
		);

		const users = await collections.users
			.find({ authProvider: "better-auth", authSubject: "ba_user_123" })
			.toArray();

		expect(users).toHaveLength(1);
	});

	it("returns unauthenticated when no session exists", async () => {
		getSessionMock.mockResolvedValue(null);

		const cookies = createCookiesMock();
		(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

		const result = await authenticateRequest(
			new Request("http://localhost/"),
			cookies,
			new URL("http://localhost/")
		);

		expect(result.user).toBeUndefined();
	});
});
