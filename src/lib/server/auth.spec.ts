import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { cleanupTestData } from "./api/__tests__/testHelpers";

const authenticateClerkRequestMock = vi.fn();
const getClerkUserMock = vi.fn();

vi.mock("./clerk", () => ({
	clerkEnabled: true,
	authenticateClerkRequest: authenticateClerkRequestMock,
	getClerkUser: getClerkUserMock,
	mapClerkUserProfile: (user: {
		id: string;
		username?: string | null;
		fullName?: string | null;
		firstName?: string | null;
		lastName?: string | null;
		imageUrl?: string;
		primaryEmailAddress?: { emailAddress: string } | null;
		emailAddresses?: Array<{ emailAddress: string }>;
	}) => ({
		authProvider: "clerk" as const,
		authSubject: user.id,
		username: user.username ?? user.primaryEmailAddress?.emailAddress.split("@")[0] ?? undefined,
		name:
			user.fullName ??
			[user.firstName, user.lastName].filter((part): part is string => !!part).join(" ") ??
			user.id,
		email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress,
		avatarUrl: user.imageUrl,
	}),
	mapClerkSessionClaimsProfile: (
		clerkUserId: string,
		claims?: Record<string, unknown>
	) => ({
		authProvider: "clerk" as const,
		authSubject: clerkUserId,
		username:
			(typeof claims?.username === "string" && claims.username) ||
			(typeof claims?.email === "string" && claims.email.split("@")[0]) ||
			undefined,
		name:
			(typeof claims?.name === "string" && claims.name) ||
			(typeof claims?.username === "string" && claims.username) ||
			(typeof claims?.email === "string" && claims.email) ||
			clerkUserId,
		email: typeof claims?.email === "string" ? claims.email : undefined,
		avatarUrl: typeof claims?.picture === "string" ? claims.picture : undefined,
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

describe("authenticateRequest with Clerk", () => {
	beforeEach(async () => {
		await cleanupTestData();
		authenticateClerkRequestMock.mockReset();
		getClerkUserMock.mockReset();
	});

	it("creates a Mongo user on the first authenticated request", async () => {
		authenticateClerkRequestMock.mockResolvedValue({
			isAuthenticated: true,
			clerkUserId: "user_test_123",
			clerkSessionId: "sess_test_123",
			sessionClaims: {
				email: "test@example.com",
				username: "test-user",
				name: "Test User",
				picture: "https://example.com/avatar.png",
			},
		});
		getClerkUserMock.mockResolvedValue({
			id: "user_test_123",
			username: "test-user",
			fullName: "Test User",
			firstName: "Test",
			lastName: "User",
			imageUrl: "https://example.com/avatar.png",
			primaryEmailAddress: { emailAddress: "test@example.com" },
			emailAddresses: [{ emailAddress: "test@example.com" }],
		});

		const cookies = createCookiesMock();
		const result = await authenticateRequest(
			new Request("http://localhost/"),
			cookies,
			new URL("http://localhost/")
		);

		const storedUser = await collections.users.findOne({
			authProvider: "clerk",
			authSubject: "user_test_123",
		});

		expect(storedUser).not.toBeNull();
		expect(storedUser).toMatchObject({
			authProvider: "clerk",
			authSubject: "user_test_123",
			email: "test@example.com",
			username: "test-user",
		});
		expect(result.user?._id.toString()).toBe(storedUser?._id.toString());
	});

	it("reuses the same Mongo user on repeat authenticated requests", async () => {
		authenticateClerkRequestMock.mockResolvedValue({
			isAuthenticated: true,
			clerkUserId: "user_test_123",
			clerkSessionId: "sess_test_123",
			sessionClaims: {
				email: "test@example.com",
				username: "test-user",
				name: "Test User",
				picture: "https://example.com/avatar.png",
			},
		});
		getClerkUserMock.mockResolvedValue({
			id: "user_test_123",
			username: "test-user",
			fullName: "Test User",
			firstName: "Test",
			lastName: "User",
			imageUrl: "https://example.com/avatar.png",
			primaryEmailAddress: { emailAddress: "test@example.com" },
			emailAddresses: [{ emailAddress: "test@example.com" }],
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
			.find({
				authProvider: "clerk",
				authSubject: "user_test_123",
			})
			.toArray();

		expect(users).toHaveLength(1);
	});

	it("creates a Mongo user from Clerk session claims when getUser is unavailable", async () => {
		authenticateClerkRequestMock.mockResolvedValue({
			isAuthenticated: true,
			clerkUserId: "user_claims_only",
			clerkSessionId: "sess_claims_only",
			sessionClaims: {
				email: "claims@example.com",
				username: "claims-user",
				name: "Claims User",
				picture: "https://example.com/claims-avatar.png",
			},
		});
		getClerkUserMock.mockRejectedValue(new Error("missing secret key"));

		const cookies = createCookiesMock();
		const result = await authenticateRequest(
			new Request("http://localhost/"),
			cookies,
			new URL("http://localhost/")
		);

		const storedUser = await collections.users.findOne({
			authProvider: "clerk",
			authSubject: "user_claims_only",
		});

		expect(storedUser).not.toBeNull();
		expect(storedUser).toMatchObject({
			authProvider: "clerk",
			authSubject: "user_claims_only",
			email: "claims@example.com",
			username: "claims-user",
			name: "Claims User",
		});
		expect(result.user?._id.toString()).toBe(storedUser?._id.toString());
	});
});
