import Stripe from "stripe";
import { config } from "$lib/server/config";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
	const secretKey = (config.STRIPE_SECRET_KEY || "").trim();
	if (!secretKey) {
		throw new Error("STRIPE_SECRET_KEY is not configured");
	}

	if (!stripeClient) {
		stripeClient = new Stripe(secretKey);
	}

	return stripeClient;
}
