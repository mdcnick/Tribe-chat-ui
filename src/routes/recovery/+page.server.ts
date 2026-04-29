import { fail } from "@sveltejs/kit";
import { hashPin } from "$lib/server/pinAuth";
import { collections } from "$lib/server/database";
import { verifyRecoveryPhrase, hashRecoveryPhrase } from "$lib/server/recoveryKey";
import type { Actions, PageServerLoad } from "./$types";
export const load: PageServerLoad = async () => {
	// Recovery works without authentication — the recovery phrase itself is the credential
	return {};
};

export const actions: Actions = {
	/** Reset PIN using recovery phrase */
	reset: async ({ request, cookies }) => {
		const formData = await request.formData();
		const recoveryPhrase = (formData.get("recoveryPhrase") as string)?.trim().toLowerCase();
		const newPin = formData.get("newPin") as string;
		const confirmPin = formData.get("confirmPin") as string;

		if (!recoveryPhrase || !newPin) {
			return fail(400, { error: "Recovery phrase and new PIN are required." });
		}

		if (!/^\d{10}$/.test(newPin)) {
			return fail(400, { error: "PIN must be exactly 10 digits." });
		}

		if (newPin !== confirmPin) {
			return fail(400, { error: "PINs don't match." });
		}

		// Find the user by recovery phrase hash
		const phraseHash = hashRecoveryPhrase(recoveryPhrase);
		const user = await collections.users.findOne({ recoveryPhraseHash: phraseHash });

		if (!user || !user.recoveryPhraseHash) {
			return fail(400, { error: "Recovery phrase not found." });
		}

		// Verify recovery phrase
		const valid = await verifyRecoveryPhrase(recoveryPhrase, user.recoveryPhraseHash);

		if (!valid) {
			return fail(400, { error: "Recovery phrase doesn't match." });
		}

		// Update PIN
		const pinHash = await hashPin(newPin);
		await collections.users.updateOne(
			{ _id: user._id },
			{ $set: { pinHash, updatedAt: new Date() } }
		);

		// Clear the recovery phrase cookie if set
		cookies.delete("recovery_phrase", { path: "/" });

		return { success: true };
	},
};
