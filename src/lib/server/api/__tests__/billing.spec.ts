import { beforeEach, describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { collections } from "$lib/server/database";
import { cleanupTestData, createTestLocals, createTestUser } from "./testHelpers";
import { config } from "$lib/server/config";

type StripeClientMock = {
	customers: { create: ReturnType<typeof vi.fn> };
	checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
	billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
	subscriptions: { retrieve: ReturnType<typeof vi.fn> };
	webhooks: { constructEvent: ReturnType<typeof vi.fn> };
};

let stripeMock: StripeClientMock;

vi.mock("$lib/server/billing/stripe", () => ({
	getStripeClient: () => stripeMock,
}));

vi.mock("$lib/server/billing/entitlements", async () => {
	const actual = await vi.importActual<typeof import("$lib/server/billing/entitlements")>(
		"$lib/server/billing/entitlements"
	);
	return {
		...actual,
		isPaywallEnabled: () => true,
	};
});

function parseResponse<T = unknown>(res: Response): Promise<T> {
	return res.text().then((text) => superjson.parse(text) as T);
}

describe("billing routes", () => {
	beforeEach(async () => {
		await cleanupTestData();
		const originalGet = config.get.bind(config);
		vi.spyOn(config, "get").mockImplementation((key) => {
			if (key === "STRIPE_PRICE_ID_PRO") return "price_pro";
			if (key === "STRIPE_WEBHOOK_SECRET") return "whsec_test";
			return originalGet(key);
		});
		stripeMock = {
			customers: { create: vi.fn() },
			checkout: { sessions: { create: vi.fn() } },
			billingPortal: { sessions: { create: vi.fn() } },
			subscriptions: { retrieve: vi.fn() },
			webhooks: { constructEvent: vi.fn() },
		};
	});

	it("checkout requires auth", async () => {
		const { POST } = await import("../../../../routes/api/v2/billing/checkout/+server");
		const locals = createTestLocals({ user: undefined });

		await expect(
			POST({
				locals,
				url: new URL("http://localhost/api/v2/billing/checkout"),
			} as Parameters<typeof POST>[0])
		).rejects.toMatchObject({ status: 401 });
	});

	it("portal requires auth", async () => {
		const { POST } = await import("../../../../routes/api/v2/billing/portal/+server");
		const locals = createTestLocals({ user: undefined });

		await expect(
			POST({
				locals,
				url: new URL("http://localhost/api/v2/billing/portal"),
			} as Parameters<typeof POST>[0])
		).rejects.toMatchObject({ status: 401 });
	});

	it("checkout returns URL and persists stripe customer link", async () => {
		const { user, locals } = await createTestUser();
		const { POST } = await import("../../../../routes/api/v2/billing/checkout/+server");

		stripeMock.customers.create.mockResolvedValue({ id: "cus_test_123" });
		stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe.test/checkout" });

		const response = await POST({
			locals,
			url: new URL("http://localhost/api/v2/billing/checkout"),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await parseResponse<{ url: string }>(response)).toEqual({
			url: "https://stripe.test/checkout",
		});

		const stored = await collections.billingEntitlements.findOne({ userId: user._id });
		expect(stored?.stripeCustomerId).toBe("cus_test_123");
		expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
		expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
	});

	it("webhook rejects bad signature", async () => {
		const { POST } = await import("../../../../routes/api/v2/billing/webhook/+server");

		stripeMock.webhooks.constructEvent.mockImplementation(() => {
			throw new Error("Invalid signature");
		});

		const response = await POST({
			request: new Request("http://localhost/api/v2/billing/webhook", {
				method: "POST",
				headers: {
					"stripe-signature": "bad",
				},
				body: "{}",
			}),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
	});

	it("webhook updates entitlement on subscription update and delete", async () => {
		const { user } = await createTestUser();
		const { POST } = await import("../../../../routes/api/v2/billing/webhook/+server");

		const updatedEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_test_123",
					customer: "cus_test_123",
					status: "active",
					cancel_at: null,
					trial_end: null,
					cancel_at_period_end: false,
					items: {
						data: [{ price: { id: "price_pro" }, current_period_end: 1_893_456_000 }],
					},
					metadata: { userId: user._id.toString() },
				},
			},
		};
		stripeMock.webhooks.constructEvent.mockReturnValueOnce(updatedEvent);

		const updatedResp = await POST({
			request: new Request("http://localhost/api/v2/billing/webhook", {
				method: "POST",
				headers: {
					"stripe-signature": "sig",
				},
				body: "{}",
			}),
		} as Parameters<typeof POST>[0]);

		expect(updatedResp.status).toBe(200);
		const active = await collections.billingEntitlements.findOne({ userId: user._id });
		expect(active?.status).toBe("active");
		expect(active?.stripeSubscriptionId).toBe("sub_test_123");
		expect(active?.currentPeriodEnd).toEqual(new Date(1_893_456_000 * 1000));

		const deletedEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_test_123",
					customer: "cus_test_123",
					status: "canceled",
					cancel_at: null,
					trial_end: null,
					cancel_at_period_end: false,
					items: { data: [{ price: { id: "price_pro" } }] },
					metadata: { userId: user._id.toString() },
				},
			},
		};
		stripeMock.webhooks.constructEvent.mockReturnValueOnce(deletedEvent);

		const deletedResp = await POST({
			request: new Request("http://localhost/api/v2/billing/webhook", {
				method: "POST",
				headers: {
					"stripe-signature": "sig",
				},
				body: "{}",
			}),
		} as Parameters<typeof POST>[0]);

		expect(deletedResp.status).toBe(200);
		const canceled = await collections.billingEntitlements.findOne({ userId: user._id });
		expect(canceled?.status).toBe("canceled");
	});
});
