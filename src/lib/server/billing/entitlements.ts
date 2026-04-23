import { ObjectId } from "mongodb";
import { config } from "$lib/server/config";
import { collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import type { BillingEntitlement, BillingPlan } from "$lib/types/BillingEntitlement";

const ACTIVE_PLAN_STATUSES = new Set(["active", "trialing"]);

const DEFAULT_DISABLED_SUMMARY: UserBillingSummary = {
	plan: null,
	status: "disabled",
	canUseHermesTools: true,
};

const DEFAULT_UNPAID_SUMMARY: UserBillingSummary = {
	plan: null,
	status: "none",
	canUseHermesTools: false,
};

function normalizeStatus(status: string | null | undefined): string {
	const normalized = (status || "").trim().toLowerCase();
	return normalized.length > 0 ? normalized : "none";
}

function parseObjectId(value: ObjectId | string | null | undefined): ObjectId | undefined {
	if (!value) return undefined;
	if (value instanceof ObjectId) return value;
	if (typeof value === "string" && ObjectId.isValid(value)) {
		return new ObjectId(value);
	}
	return undefined;
}

function parseCurrentPeriodEnd(value: Date | number | null | undefined): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (value instanceof Date) return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		// Stripe timestamps are in seconds.
		return new Date(value * 1000);
	}
	return undefined;
}

function isConfiguredProPrice(
	stripePriceId: string | null | undefined,
	configuredProPriceOverride?: string
): boolean {
	const configured = (configuredProPriceOverride || config.STRIPE_PRICE_ID_PRO || "").trim();
	if (!configured) {
		return false;
	}
	return (stripePriceId || "").trim() === configured;
}

function deriveCanUseHermesTools(plan: BillingPlan, status: string): boolean {
	return plan === "pro" && ACTIVE_PLAN_STATUSES.has(status);
}

export interface UserBillingSummary {
	plan: BillingPlan;
	status: string;
	canUseHermesTools: boolean;
}

interface EntitlementOptions {
	paywallEnabled?: boolean;
}

export interface UpsertEntitlementFromStripeSubscriptionInput {
	userId?: ObjectId | string | null;
	stripeCustomerId?: string | null;
	stripeSubscriptionId?: string | null;
	stripePriceId?: string | null;
	status?: string | null;
	currentPeriodEnd?: Date | number | null;
	cancelAtPeriodEnd?: boolean | null;
	proPriceId?: string;
}

export function isPaywallEnabled(): boolean {
	return (config.PAYWALL_ENABLED || "").trim().toLowerCase() === "true";
}

function resolvePaywallEnabled(options?: EntitlementOptions): boolean {
	if (typeof options?.paywallEnabled === "boolean") {
		return options.paywallEnabled;
	}
	return isPaywallEnabled();
}

export async function getUserEntitlement(
	userId: ObjectId | string | null | undefined,
	options?: EntitlementOptions
): Promise<UserBillingSummary> {
	if (!resolvePaywallEnabled(options)) {
		return DEFAULT_DISABLED_SUMMARY;
	}

	const userObjectId = parseObjectId(userId);
	if (!userObjectId) {
		return DEFAULT_UNPAID_SUMMARY;
	}

	const entitlement = await collections.billingEntitlements.findOne({ userId: userObjectId });
	if (!entitlement) {
		return DEFAULT_UNPAID_SUMMARY;
	}

	const status = normalizeStatus(entitlement.status);
	const plan: BillingPlan = entitlement.plan ?? null;
	const canUseHermesTools =
		typeof entitlement.canUseHermesTools === "boolean"
			? entitlement.canUseHermesTools
			: deriveCanUseHermesTools(plan, status);

	return {
		plan,
		status,
		canUseHermesTools,
	};
}

export async function canUseHermesTools(
	locals: App.Locals | undefined,
	options?: EntitlementOptions
): Promise<boolean> {
	if (!resolvePaywallEnabled(options)) {
		return true;
	}

	const userId = locals?.user?._id;
	if (!userId) {
		return false;
	}

	const entitlement = await getUserEntitlement(userId, options);
	return entitlement.canUseHermesTools;
}

export async function getEntitlementByStripeCustomerId(
	stripeCustomerId: string
): Promise<BillingEntitlement | null> {
	const customerId = stripeCustomerId.trim();
	if (!customerId) return null;
	return collections.billingEntitlements.findOne({ stripeCustomerId: customerId });
}

export async function upsertStripeCustomerLink(
	userId: ObjectId | string,
	stripeCustomerId: string
): Promise<void> {
	const userObjectId = parseObjectId(userId);
	if (!userObjectId) {
		throw new Error("Invalid user id for Stripe customer link");
	}

	const customerId = stripeCustomerId.trim();
	if (!customerId) {
		throw new Error("Invalid Stripe customer id");
	}

	const now = new Date();
	await collections.billingEntitlements.updateOne(
		{ userId: userObjectId },
		{
			$set: {
				userId: userObjectId,
				stripeCustomerId: customerId,
				updatedAt: now,
			},
			$setOnInsert: {
				createdAt: now,
				plan: null,
				status: "none",
				canUseHermesTools: false,
			},
		},
		{ upsert: true }
	);
}

export async function upsertEntitlementFromStripeSubscription(
	input: UpsertEntitlementFromStripeSubscriptionInput
): Promise<void> {
	const userObjectId = parseObjectId(input.userId);
	const stripeCustomerId = (input.stripeCustomerId || "").trim() || undefined;
	const stripeSubscriptionId = (input.stripeSubscriptionId || "").trim() || undefined;
	const stripePriceId = (input.stripePriceId || "").trim() || undefined;
	const status = normalizeStatus(input.status);
	const plan: BillingPlan = isConfiguredProPrice(stripePriceId, input.proPriceId) ? "pro" : null;
	const canUseHermesTools = deriveCanUseHermesTools(plan, status);
	const currentPeriodEnd = parseCurrentPeriodEnd(input.currentPeriodEnd);
	const now = new Date();

	const setPayload: Partial<BillingEntitlement> & { updatedAt: Date } = {
		updatedAt: now,
		plan,
		status,
		canUseHermesTools,
	};

	if (userObjectId) setPayload.userId = userObjectId;
	if (stripeCustomerId) setPayload.stripeCustomerId = stripeCustomerId;
	if (stripeSubscriptionId) setPayload.stripeSubscriptionId = stripeSubscriptionId;
	if (stripePriceId) setPayload.stripePriceId = stripePriceId;
	if (currentPeriodEnd !== undefined) setPayload.currentPeriodEnd = currentPeriodEnd;
	if (typeof input.cancelAtPeriodEnd === "boolean") {
		setPayload.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
	}

	if (userObjectId) {
		await collections.billingEntitlements.updateOne(
			{ userId: userObjectId },
			{
				$set: setPayload,
				$setOnInsert: {
					createdAt: now,
				},
			},
			{ upsert: true }
		);
		return;
	}

	const filter = stripeCustomerId
		? { stripeCustomerId }
		: stripeSubscriptionId
			? { stripeSubscriptionId }
			: undefined;
	if (!filter) {
		logger.warn(
			{ status, stripeCustomerId, stripeSubscriptionId },
			"[billing] skipping entitlement update: no stable lookup key"
		);
		return;
	}

	const result = await collections.billingEntitlements.updateOne(filter, {
		$set: setPayload,
	});

	if (result.matchedCount === 0) {
		logger.warn(
			{ status, stripeCustomerId, stripeSubscriptionId },
			"[billing] subscription event could not be linked to a user entitlement"
		);
	}
}
