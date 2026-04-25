<script lang="ts">
	import CarbonClose from "~icons/carbon/close";
	import CarbonRenew from "~icons/carbon/renew";

	interface Props {
		debugUrl?: string;
		url?: string;
		error?: string;
		onClose: () => void;
	}

	const IFRAME_LOAD_ERROR_MESSAGE = "Couldn’t load the live browser. Try reloading or close the panel.";

	let { debugUrl, url, error, onClose }: Props = $props();

	let loaded = $state(false);
	let iframeKey = $state(0);
	let panelError = $state<string | undefined>();

	$effect(() => {
		panelError = error;
		if (!debugUrl) {
			loaded = false;
		}
	});

	function handleLoad() {
		loaded = true;
		panelError = undefined;
	}

	function handleIframeError() {
		loaded = false;
		panelError = IFRAME_LOAD_ERROR_MESSAGE;
	}

	function handleReload() {
		if (!debugUrl) {
			return;
		}

		loaded = false;
		panelError = undefined;
		iframeKey += 1;
	}

	const canRetry = $derived(Boolean(debugUrl));
	const headerLabel = $derived(url ?? "Live Browser");
	const visibleError = $derived(panelError ?? error);
</script>

<div class="flex h-full w-full flex-col bg-white dark:bg-gray-900">
	<div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<span class="truncate text-xs text-gray-500 dark:text-gray-400">{headerLabel}</span>
		</div>
		<div class="flex items-center gap-1">
			{#if canRetry}
				<button
					type="button"
					class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
					onclick={handleReload}
					aria-label="Reload browser"
					title="Reload"
				>
					<CarbonRenew class="size-4" />
				</button>
			{/if}
			<button
				type="button"
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
				onclick={onClose}
				aria-label="Close browser panel"
				title="Close"
			>
				<CarbonClose class="size-4" />
			</button>
		</div>
	</div>

	<div class="relative flex-1">
		{#if visibleError}
			<div class="flex h-full items-center justify-center bg-white p-6 dark:bg-gray-900">
				<div class="flex max-w-sm flex-col items-center gap-3 text-center">
					<p class="text-sm font-medium text-gray-900 dark:text-gray-100">Browser unavailable</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">{visibleError}</p>
					<div class="flex items-center gap-2">
						{#if canRetry}
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
								onclick={handleReload}
							>
								<CarbonRenew class="size-4" />
								Retry
							</button>
						{/if}
						<button
							type="button"
							class="inline-flex items-center rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
							onclick={onClose}
						>
							Close panel
						</button>
					</div>
				</div>
			</div>
		{:else if debugUrl}
			{#if !loaded}
				<div class="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
					<div class="flex flex-col items-center gap-2">
						<div
							class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300"
						></div>
						<span class="text-xs text-gray-500 dark:text-gray-400">Loading browser…</span>
					</div>
				</div>
			{/if}
			{#key iframeKey}
				<iframe
					src={`${debugUrl}?interactive=true&showControls=true`}
					title="Live Browser"
					class="h-full w-full"
					onload={handleLoad}
					onerror={handleIframeError}
					sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
				></iframe>
			{/key}
		{/if}
	</div>
</div>
