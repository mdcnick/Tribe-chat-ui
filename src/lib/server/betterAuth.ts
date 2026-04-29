/**
 * Better Auth integration is preserved as a backup but currently disabled.
 * The app uses PIN-based auth instead (see pinAuth.ts).
 *
 * These exports are kept as no-ops so that any remaining imports don't break.
 * To re-enable Better Auth, restore the files from .archive/better-auth-backup/
 */

export const betterAuthEnabled = false;

export async function getBetterAuth(): Promise<never> {
	throw new Error(
		"Better Auth is disabled. The app uses PIN-based auth. " +
			"To re-enable, restore files from .archive/better-auth-backup/"
	);
}

export function mapBetterAuthUser(): never {
	throw new Error("Better Auth is disabled.");
}

export function setAuthSessionCookie(): void {
	// No-op — PIN auth manages its own sessions
}

export function clearAuthSessionCookie(): void {
	// No-op
}

export function forwardBetterAuthCookies(): void {
	// No-op
}
