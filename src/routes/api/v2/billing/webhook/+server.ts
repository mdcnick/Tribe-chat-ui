import type Stripe from "stripe";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import { getStripeClient } from "$lib/server/billing/stripe";
import {
	isPaywallEnabled,
	upsertEntitlementFromStripeSubscription,
	upsertStripeCustomerLink,
} from "$lib/server/billing/entitlements";

function getCustomerId(
	customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | undefined {
	if (!customer) return undefined;
	return typeof customer === "string" ? customer : customer.id;
}

function getSubscriptionId(
	subscription: string | Stripe.Subscription | null | undefined
): string | undefined {
	if (!subscription) return undefined;
	return typeof subscription === "string" ? subscription : subscription.id;
}

function getUserIdFromMetadata(
	metadata: Record<string, string> | null | undefined
): string | undefined {
	const userId = metadata?.userId;
	return userId && userId.trim().length > 0 ? userId.trim() : undefined;
}

async function applySubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
	await upsertEntitlementFromStripeSubscription({
		userId: getUserIdFromMetadata(subscription.metadata),
		stripeCustomerId: getCustomerId(subscription.customer),
		stripeSubscriptionId: subscription.id,
		stripePriceId: subscription.items.data[0]?.price?.id ?? null,
		status: subscription.status,
		currentPeriodEnd:
			subscription.items.data[0]?.current_period_end ??
			subscription.cancel_at ??
			subscription.trial_end ??
			null,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
	});
}

export async function POST({ request }: { request: Request }) {
	if (!isPaywallEnabled()) {
		return new Response("ok");
	}

	const stripe = getStripeClient();
	const webhookSecret = (config.STRIPE_WEBHOOK_SECRET || "").trim();
	if (!webhookSecret) {
		logger.error({}, "[billing] STRIPE_WEBHOOK_SECRET is not configured");
		return new Response("Webhook secret not configured", { status: 500 });
	}

	const signature = request.headers.get("stripe-signature");
	if (!signature) {
		return new Response("Missing stripe-signature header", { status: 400 });
	}

	const payload = await request.text();

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
	} catch (err) {
		logger.warn({ err: String(err) }, "[billing] invalid Stripe webhook signature");
		return new Response("Invalid signature", { status: 400 });
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				const userId =
					session.client_reference_id ??
					getUserIdFromMetadata(session.metadata as Record<string, string> | undefined);
				const customerId = getCustomerId(
					session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null
				);
				const subscriptionId = getSubscriptionId(
					session.subscription as string | Stripe.Subscription | null | undefined
				);

				if (userId && customerId) {
					await upsertStripeCustomerLink(userId, customerId);
				}

				if (subscriptionId) {
					const subscription = await stripe.subscriptions.retrieve(subscriptionId);
					await applySubscriptionUpdate(subscription);
				}
				break;
			}
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;
				await applySubscriptionUpdate(subscription);
				break;
			}
			default:
				break;
		}

		return new Response("ok");
	} catch (err) {
		logger.error(
			{ err: String(err), type: event.type },
			"[billing] failed to process webhook event"
		);
		return new Response("Webhook processing failed", { status: 500 });
	}
}
