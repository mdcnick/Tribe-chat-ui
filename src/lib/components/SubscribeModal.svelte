<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import { isPro } from "$lib/stores/isPro";
	import IconPro from "$lib/components/icons/IconPro.svelte";
	import IconDazzled from "$lib/components/icons/IconDazzled.svelte";
	import { handleResponse, useAPIClient } from "$lib/APIClient";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	interface Props {
		close: () => void;
		onContinueWithoutTools?: () => void;
	}

	let { close, onContinueWithoutTools }: Props = $props();

	const client = useAPIClient();
	const publicConfig = usePublicConfig();
	const paywallEnabled = (publicConfig.PUBLIC_PAYWALL_ENABLED || "").toLowerCase() === "true";
	const isStripePaywallMode = paywallEnabled;

	let billingBusy = $state(false);
	let billingError = $state<string | null>(null);

	async function startBillingFlow(kind: "checkout" | "portal") {
		billingBusy = true;
		billingError = null;
		try {
			const response =
				kind === "checkout"
					? await client.billing.checkout.post()
					: await client.billing.portal.post();
			const { url } = handleResponse(response) as { url?: string };
			if (!url) {
				throw new Error("Billing URL not returned by server");
			}
			window.location.assign(url);
		} catch (err) {
			billingError = err instanceof Error ? err.message : "Failed to start billing flow";
		} finally {
			billingBusy = false;
		}
	}

	function continueWithoutTools() {
		onContinueWithoutTools?.();
		close();
	}
</script>

<Modal closeOnBackdrop={false} onclose={close} width="!max-w-[420px] !m-4">
	<div
		class="flex w-full flex-col gap-8 bg-white bg-gradient-to-b to-transparent px-6 pb-7 dark:bg-black dark:from-white/10 dark:to-white/5"
	>
		<div
			class="-mx-6 grid h-48 select-none place-items-center bg-gradient-to-t from-black/5 dark:from-white/10"
		>
			<div class="flex flex-col items-center justify-center gap-2.5 px-8 text-center">
				<div
					class="flex size-14 items-center justify-center rounded-full text-3xl {$isPro
						? 'bg-gradient-to-br from-yellow-500/15 via-orange-500/15 to-red-500/15'
						: 'bg-gradient-to-br from-pink-500/15 from-15% via-green-500/15 to-yellow-500/15'}"
				>
					{#if $isPro}
						<IconDazzled />
					{:else}
						<IconPro classNames="!mr-0" />
					{/if}
				</div>
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
					{isStripePaywallMode ? "Upgrade Required" : $isPro ? "Out of Credits" : "Upgrade Required"}
				</h2>
			</div>
		</div>

		<div class="text-gray-700 dark:text-gray-200">
			{#if isStripePaywallMode}
				<p class="text-[15px] leading-relaxed">
					Hermes and MCP tool execution are available on the Pro plan.
				</p>
				<p class="mt-3 text-[15px] italic leading-relaxed opacity-75">
					You can keep chatting without tools, or upgrade to re-enable tool use.
				</p>
			{:else if $isPro}
				<p class="text-[15px] leading-relaxed">
					You've used all your available credits. Purchase additional credits to continue using
					HuggingChat.
				</p>
				<p class="mt-3 text-[15px] italic leading-relaxed opacity-75">
					Your credits can be used in other HF services and external apps via Inference Providers.
				</p>
			{:else}
				<p class="text-[15px] leading-relaxed">
					You've reached your message limit. Upgrade to Hugging Face PRO to continue using
					HuggingChat.
				</p>
				<p class="mt-3 text-[15px] italic leading-relaxed opacity-75">
					It's also possible to use your PRO credits in your favorite AI tools.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-2.5">
			{#if paywallEnabled}
				<button
					class="w-full rounded-xl bg-black px-5 py-2.5 text-center text-base font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-black dark:hover:bg-gray-200"
					onclick={() => startBillingFlow($isPro ? "portal" : "checkout")}
					disabled={billingBusy}
				>
					{#if billingBusy}
						Opening billing...
					{:else}
						{$isPro ? "Manage Billing" : "Upgrade to Pro"}
					{/if}
				</button>
				{#if onContinueWithoutTools}
					<button
						class="w-full rounded-xl bg-blue-600/10 px-5 py-2.5 text-base font-medium text-blue-700 hover:bg-blue-600/20 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30"
						onclick={continueWithoutTools}
					>
						Continue without tools
					</button>
				{/if}
			{:else if $isPro}
				<a
					href="https://huggingface.co/settings/billing?add-credits=true"
					target="_blank"
					rel="noopener noreferrer"
					class="w-full rounded-xl bg-black px-5 py-2.5 text-center text-base font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
				>
					Purchase Credits
				</a>
			{:else}
				<a
					href="https://huggingface.co/subscribe/pro?from=HuggingChat"
					target="_blank"
					rel="noopener noreferrer"
					class="w-full rounded-xl bg-black px-5 py-2.5 text-center text-base font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
				>
					Upgrade to Pro
				</a>
			{/if}
			{#if billingError}
				<p class="px-1 text-xs text-red-600 dark:text-red-400">{billingError}</p>
			{/if}
			<button
				class="w-full rounded-xl bg-gray-200 px-5 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-300/80 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
				onclick={close}
			>
				Maybe later
			</button>
		</div>
	</div>
</Modal>
