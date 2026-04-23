import { describe, it, expect, beforeEach } from "vitest";
import {
	createTestLocals,
	createTestUser,
	cleanupTestData,
} from "$lib/server/api/__tests__/testHelpers";
import {
	canUseHermesTools,
	getUserEntitlement,
	upsertEntitlementFromStripeSubscription,
} from "./entitlements";

describe("billing entitlements", () => {
	beforeEach(async () => {
		await cleanupTestData();
	}, 20000);

	it("allows Hermes tools for active or trialing pro subscriptions", async () => {
		const { user } = await createTestUser();

		await upsertEntitlementFromStripeSubscription({
			userId: user._id,
			stripeCustomerId: "cus_active",
			stripeSubscriptionId: "sub_active",
			stripePriceId: "price_pro",
			proPriceId: "price_pro",
			status: "active",
		});

		const active = await getUserEntitlement(user._id, { paywallEnabled: true });
		expect(active).toMatchObject({
			plan: "pro",
			status: "active",
			canUseHermesTools: true,
		});

		await upsertEntitlementFromStripeSubscription({
			userId: user._id,
			stripeCustomerId: "cus_active",
			stripeSubscriptionId: "sub_active",
			stripePriceId: "price_pro",
			proPriceId: "price_pro",
			status: "trialing",
		});

		const trialing = await getUserEntitlement(user._id, { paywallEnabled: true });
		expect(trialing).toMatchObject({
			plan: "pro",
			status: "trialing",
			canUseHermesTools: true,
		});
	});

	it("denies Hermes tools for missing entitlement, canceled, and past_due", async () => {
		const { user } = await createTestUser();

		const missing = await getUserEntitlement(user._id, { paywallEnabled: true });
		expect(missing.canUseHermesTools).toBe(false);

		await upsertEntitlementFromStripeSubscription({
			userId: user._id,
			stripeCustomerId: "cus_denied",
			stripeSubscriptionId: "sub_denied",
			stripePriceId: "price_pro",
			proPriceId: "price_pro",
			status: "canceled",
		});

		const canceled = await getUserEntitlement(user._id, { paywallEnabled: true });
		expect(canceled.canUseHermesTools).toBe(false);
		expect(canceled.status).toBe("canceled");

		await upsertEntitlementFromStripeSubscription({
			userId: user._id,
			stripeCustomerId: "cus_denied",
			stripeSubscriptionId: "sub_denied",
			stripePriceId: "price_pro",
			proPriceId: "price_pro",
			status: "past_due",
		});

		const pastDue = await getUserEntitlement(user._id, { paywallEnabled: true });
		expect(pastDue.canUseHermesTools).toBe(false);
		expect(pastDue.status).toBe("past_due");
	});

	it("short-circuits allow when paywall is disabled", async () => {
		const anonymous = createTestLocals({ user: undefined });
		const allowed = await canUseHermesTools(anonymous, { paywallEnabled: false });
		expect(allowed).toBe(true);
	});
});
