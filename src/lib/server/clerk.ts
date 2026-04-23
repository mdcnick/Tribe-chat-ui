import { createClerkClient, type ClerkClient, type User as ClerkUser } from "@clerk/backend";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";

let clerkClientInstance: ClerkClient | null = null;

export type ClerkRequestAuth = {
	isAuthenticated: boolean;
	clerkUserId?: string;
	clerkSessionId?: string;
	sessionClaims?: Record<string, unknown>;
};

export const clerkEnabled =
	!!config.PUBLIC_CLERK_PUBLISHABLE_KEY && (!!config.CLERK_SECRET_KEY || !!config.CLERK_JWT_KEY);

function getAuthorizedParties(url: URL): string[] {
	const origins = new Set<string>();

	origins.add(url.origin);

	if (config.PUBLIC_ORIGIN) {
		origins.add(new URL(config.PUBLIC_ORIGIN).origin);
	}

	if (import.meta.env.DEV) {
		origins.add("http://localhost:5173");
		origins.add("http://127.0.0.1:5173");
	}

	return [...origins];
}

export function getClerkClient(): ClerkClient {
	if (!clerkClientInstance) {
		clerkClientInstance = createClerkClient({
			publishableKey: config.PUBLIC_CLERK_PUBLISHABLE_KEY,
			secretKey: config.CLERK_SECRET_KEY || undefined,
			jwtKey: config.CLERK_JWT_KEY || undefined,
		});
	}

	return clerkClientInstance;
}

export async function authenticateClerkRequest(
	request: Request,
	url: URL
): Promise<ClerkRequestAuth> {
	if (!clerkEnabled) {
		return { isAuthenticated: false };
	}

	try {
		const requestState = await getClerkClient().authenticateRequest(request, {
			authorizedParties: getAuthorizedParties(url),
			jwtKey: config.CLERK_JWT_KEY || undefined,
		});

		if (!requestState.isAuthenticated) {
			return { isAuthenticated: false };
		}

		const auth = requestState.toAuth();

		return {
			isAuthenticated: !!auth.userId,
			clerkUserId: auth.userId ?? undefined,
			clerkSessionId: auth.sessionId ?? undefined,
			sessionClaims:
				auth.sessionClaims && typeof auth.sessionClaims === "object"
					? (auth.sessionClaims as Record<string, unknown>)
					: undefined,
		};
	} catch (error) {
		logger.warn(error, "Failed to authenticate Clerk request");
		return { isAuthenticated: false };
	}
}

export async function getClerkUser(clerkUserId: string): Promise<ClerkUser> {
	return getClerkClient().users.getUser(clerkUserId);
}

export async function revokeClerkSession(clerkSessionId: string): Promise<void> {
	await getClerkClient().sessions.revokeSession(clerkSessionId);
}

export function getClerkPrimaryEmail(user: ClerkUser): string | undefined {
	return (
		user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? undefined
	);
}

export function mapClerkUserProfile(user: ClerkUser) {
	const email = getClerkPrimaryEmail(user);
	const username = user.username ?? email?.split("@")[0] ?? undefined;
	const name =
		user.fullName ??
		([user.firstName, user.lastName].filter((part): part is string => !!part).join(" ") ||
			username ||
			email ||
			user.id);

	return {
		authProvider: "clerk" as const,
		authSubject: user.id,
		username,
		name,
		email,
		avatarUrl: user.imageUrl || undefined,
	};
}

function getStringClaim(
	claims: Record<string, unknown> | undefined,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const value = claims?.[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}
	return undefined;
}

export function mapClerkSessionClaimsProfile(clerkUserId: string, claims?: Record<string, unknown>) {
	const email = getStringClaim(claims, "email", "email_address");
	const username = getStringClaim(claims, "username") ?? email?.split("@")[0] ?? undefined;
	const name =
		getStringClaim(claims, "name", "full_name") ??
		([getStringClaim(claims, "first_name"), getStringClaim(claims, "last_name")]
			.filter((part): part is string => !!part)
			.join(" ") ||
			username ||
			email ||
			clerkUserId);

	return {
		authProvider: "clerk" as const,
		authSubject: clerkUserId,
		username,
		name,
		email,
		avatarUrl: getStringClaim(claims, "picture", "image_url", "avatar_url"),
	};
}
