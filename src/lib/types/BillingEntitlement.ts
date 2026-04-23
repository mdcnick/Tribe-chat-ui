import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

export type BillingPlan = "pro" | null;

export interface BillingEntitlement extends Timestamps {
	userId: ObjectId;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	stripePriceId?: string;
	plan: BillingPlan;
	status: string;
	canUseHermesTools: boolean;
	currentPeriodEnd?: Date | null;
	cancelAtPeriodEnd?: boolean;
}
