import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { getUserEntitlement, isPaywallEnabled } from "$lib/server/billing/entitlements";

export const GET: RequestHandler = async ({ locals }) => {
	const billing =
		locals.user && isPaywallEnabled() ? await getUserEntitlement(locals.user._id) : undefined;

	return superjsonResponse(
		locals.user
			? {
					id: locals.user._id.toString(),
					username: locals.user.username,
					avatarUrl: locals.user.avatarUrl,
					email: locals.user.email,
					authProvider: locals.user.authProvider,
					authSubject: locals.user.authSubject,
					isAdmin: locals.user.isAdmin ?? false,
					isEarlyAccess: locals.user.isEarlyAccess ?? false,
					...(billing ? { billing } : {}),
				}
			: null
	);
};
