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

	const stripePriceId = (config.STRIPE_PRICE_ID_PRO || "").trim();
	if (!stripePriceId) {
		error(500, "STRIPE_PRICE_ID_PRO is not configured");
	}

	const stripe = getStripeClient();
	const userId = locals.user._id;

	const existing = await collections.billingEntitlements.findOne({ userId });
	let stripeCustomerId = existing?.stripeCustomerId;

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
	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer: stripeCustomerId,
		client_reference_id: userId.toString(),
		line_items: [{ price: stripePriceId, quantity: 1 }],
		success_url: `${appOrigin}${base}/settings/application?checkout=success`,
		cancel_url: `${appOrigin}${base}/settings/application?checkout=canceled`,
		allow_promotion_codes: true,
		metadata: {
			userId: userId.toString(),
		},
		subscription_data: {
			metadata: {
				userId: userId.toString(),
			},
		},
	});

	if (!session.url) {
		error(500, "Stripe checkout URL unavailable");
	}

	return superjsonResponse({ url: session.url });
};
