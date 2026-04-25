<script lang="ts">
	import CarbonClose from "~icons/carbon/close";
	import CarbonRenew from "~icons/carbon/renew";

	interface Props {
		debugUrl: string;
		url?: string;
		onClose: () => void;
	}

	let { debugUrl, url, onClose }: Props = $props();

	let loaded = $state(false);
	let iframeKey = $state(0);

	function handleLoad() {
		loaded = true;
	}

	function handleReload() {
		loaded = false;
		iframeKey += 1;
	}
</script>

<div class="flex h-full w-full flex-col bg-white dark:bg-gray-900">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<span class="truncate text-xs text-gray-500 dark:text-gray-400">
				{url ?? "Live Browser"}
			</span>
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
				onclick={handleReload}
				aria-label="Reload browser"
				title="Reload"
			>
				<CarbonRenew class="size-4" />
			</button>
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

	<!-- Iframe -->
	<div class="relative flex-1">
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
				src={`${debugUrl}?interactive=true`}
				title="Live Browser"
				class="h-full w-full"
				onload={handleLoad}
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
			></iframe>
		{/key}
	</div>
</div>
