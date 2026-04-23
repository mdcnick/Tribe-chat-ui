import { base } from "$app/paths";
import { error, type RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import { config } from "$lib/server/config";
import { collections } from "$lib/server/database";
import { isPaywallEnabled, upsertStripeCustomerLink } from "$lib/server/billing/entitlements";
import { getStripeClient } from "$lib/server/billing/stripe";

function getAppOrigin(url: URL): string {
	const configuredOrigin = (config.PUBLIC_ORIGIN || "").trim();
	if (configuredOrigin) {
		return configuredOrigin.replace(/\/$/, "");
	}
	return url.origin.replace(/\/$/, "");
}

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!isPaywallEnabled()) {
		error(404, "Not found");
	}

	if (!locals.user) {
		error(401, "Login required");
	}

	const stripe = getStripeClient();
	const userId = locals.user._id;
	let stripeCustomerId = (
		await collections.billingEntitlements.findOne(
			{ userId },
			{ projection: { stripeCustomerId: 1 } }
		)
	)?.stripeCustomerId;

	if (!stripeCustomerId) {
		const customer = await stripe.customers.create({
			email: locals.user.email,
			name: locals.user.name || locals.user.username || undefined,
			metadata: {
				userId: userId.toString(),
			},
		});
		stripeCustomerId = customer.id;
		await upsertStripeCustomerLink(userId, stripeCustomerId);
	}

	const appOrigin = getAppOrigin(url);
	const portal = await stripe.billingPortal.sessions.create({
		customer: stripeCustomerId,
		return_url: `${appOrigin}${base}/settings/application`,
	});

	return superjsonResponse({ url: portal.url });
};
