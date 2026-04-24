<script lang="ts">
	import { invalidateAll, goto } from "$app/navigation";
	import { base } from "$app/paths";
	import { page } from "$app/state";
	import { error } from "$lib/stores/errors";
	import { useSettingsStore } from "$lib/stores/settings";
	import type { Model } from "$lib/types/Model";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import { tick } from "svelte";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonSearch from "~icons/carbon/search";
	import LucideChevronDown from "~icons/lucide/chevron-down";
	import LucideStar from "~icons/lucide/star";
	import LucideStarOff from "~icons/lucide/star-off";
	import LucideHammer from "~icons/lucide/hammer";
	import LucideImage from "~icons/lucide/image";

	interface Props {
		models: Model[];
		currentModel: Model;
		disabled?: boolean;
	}

	let { models, currentModel, disabled = false }: Props = $props();

	const settings = useSettingsStore();

	let rootEl: HTMLDivElement | undefined = $state();
	let searchInputEl: HTMLInputElement | undefined = $state();
	let listEl: HTMLDivElement | undefined = $state();
	let isOpen = $state(false);
	let modelFilter = $state("");
	let activeProvider = $state("all");
	let changingModelId = $state<string | null>(null);
	let highlightedIndex = $state(0);
	let favorites = $state<Set<string>>(new Set());

	const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
	let queryTokens = $derived(normalize(modelFilter).trim().split(/\s+/).filter(Boolean));

	function getModelProviders(model: Model): string[] {
		const providers = model.providers ?? [];
		const names = providers
			.map((p) =>
				typeof p === "object" && p !== null ? (p as Record<string, unknown>).provider : undefined
			)
			.filter((p): p is string => typeof p === "string" && p.length > 0);
		return names.length > 0 ? names : ["other"];
	}

	function getPrimaryProvider(model: Model): string {
		return getModelProviders(model)[0] ?? "other";
	}

	function providerDisplayName(providerId: string): string {
		const mapping: Record<string, string> = {
			"hf-inference": "Hugging Face",
			"fireworks-ai": "Fireworks AI",
			together: "Together AI",
			sambanova: "SambaNova",
			groq: "Groq",
			cohere: "Cohere",
			openai: "OpenAI",
			novita: "Novita",
			nebius: "Nebius",
			hyperbolic: "Hyperbolic",
			replicate: "Replicate",
			"fal-ai": "Fal.ai",
			baseten: "Baseten",
			cerebras: "Cerebras",
			clarifai: "Clarifai",
			nscale: "Nscale",
			ovhcloud: "OVHcloud",
			publicai: "Public AI",
			scaleway: "Scaleway",
			wavespeed: "Wavespeed",
			"zai-org": "Z.ai",
			"featherless-ai": "Featherless AI",
			"black-forest-labs": "Black Forest Labs",
			other: "Other",
		};
		return (
			mapping[providerId] ?? providerId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
		);
	}

	function providerMonogram(providerId: string): string {
		const name = providerDisplayName(providerId);
		return name
			.split(/\s+/)
			.map((part) => part[0] ?? "")
			.join("")
			.slice(0, 2)
			.toUpperCase();
	}

	function modelDescription(model: Model): string {
		if (model.isRouter) {
			return "Smart routing";
		}
		return providerDisplayName(getPrimaryProvider(model));
	}

	let availableModels = $derived(models.filter((model) => !model.unlisted));
	let providerOptions = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const model of availableModels) {
			for (const provider of getModelProviders(model)) {
				counts.set(provider, (counts.get(provider) ?? 0) + 1);
			}
		}

		const providers = Array.from(counts.entries())
			.map(([id, count]) => ({ id, count, label: providerDisplayName(id) }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return [{ id: "all", count: availableModels.length, label: "All" }, ...providers];
	});

	let filteredModels = $derived(
		availableModels.filter((model) => {
			if (activeProvider !== "all" && !getModelProviders(model).includes(activeProvider)) {
				return false;
			}

			if (queryTokens.length === 0) {
				return true;
			}

			const haystack = normalize(
				`${model.id} ${model.name ?? ""} ${model.displayName ?? ""} ${providerDisplayName(getPrimaryProvider(model))}`
			);
			return queryTokens.every((q) => haystack.includes(q));
		})
	);

	let currentProviderOverride = $derived($settings.providerOverrides?.[currentModel.id]);
	let hasProviderOverride = $derived(
		currentProviderOverride && currentProviderOverride !== "auto" && !currentModel.isRouter
	);

	function supportsTools(model: Model): boolean {
		return (
			$settings.toolsOverrides?.[model.id] ??
			Boolean((model as unknown as { supportsTools?: boolean }).supportsTools)
		);
	}

	function supportsMultimodal(model: Model): boolean {
		return $settings.multimodalOverrides?.[model.id] ?? Boolean(model.multimodal);
	}

	function toggleFavorite(modelId: string, event: MouseEvent) {
		event.stopPropagation();
		const newFavorites = new Set(favorites);
		if (newFavorites.has(modelId)) {
			newFavorites.delete(modelId);
		} else {
			newFavorites.add(modelId);
		}
		favorites = newFavorites;
	}

	async function focusSearch() {
		await tick();
		searchInputEl?.focus();
		searchInputEl?.select();
	}

	function openPicker() {
		if (disabled) return;
		isOpen = true;
		modelFilter = "";
		activeProvider = "all";
		highlightedIndex = 0;
		void focusSearch();
	}

	function closePicker() {
		isOpen = false;
		modelFilter = "";
	}

	async function selectModel(model: Model) {
		if (changingModelId || model.id === currentModel.id) {
			closePicker();
			return;
		}

		changingModelId = model.id;

		try {
			if (page.params.id) {
				const response = await fetch(`${base}/conversation/${page.params.id}`, {
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ model: model.id }),
				});

				if (!response.ok) {
					throw new Error("Failed to update conversation model");
				}

				await invalidateAll();
			} else if (page.route.id?.includes("/models/")) {
				await settings.instantSet({ activeModel: model.id });
				await goto(`${base}/models/${model.id}`);
			} else {
				await settings.instantSet({ activeModel: model.id });
			}

			closePicker();
		} catch (err) {
			console.error(err);
			$error = err instanceof Error ? err.message : "Failed to switch model";
		} finally {
			changingModelId = null;
		}
	}

	function handleWindowPointer(event: MouseEvent) {
		if (!isOpen || !rootEl) return;
		if (rootEl.contains(event.target as Node)) return;
		closePicker();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!isOpen) return;

		if (event.key === "Escape") {
			event.preventDefault();
			closePicker();
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, filteredModels.length - 1);
			scrollToHighlighted();
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
			scrollToHighlighted();
			return;
		}

		if (event.key === "Enter" && filteredModels.length > 0) {
			event.preventDefault();
			selectModel(filteredModels[highlightedIndex]);
			return;
		}
	}

	function scrollToHighlighted() {
		tick().then(() => {
			const items = listEl?.querySelectorAll('[role="option"]');
			const highlighted = items?.[highlightedIndex] as HTMLElement | undefined;
			if (highlighted && listEl) {
				highlighted.scrollIntoView({ block: "nearest" });
			}
		});
	}

	function getProviderIconUrl(providerId: string): string | null {
		if (providerId === "all") return null;
		const hubOrg = PROVIDERS_HUB_ORGS[providerId as keyof typeof PROVIDERS_HUB_ORGS];
		if (hubOrg) {
			return `https://huggingface.co/api/avatars/${hubOrg}`;
		}
		return null;
	}
</script>

<svelte:window onmousedown={handleWindowPointer} onkeydown={handleWindowKeydown} />

<div class="relative" bind:this={rootEl}>
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 {disabled
			? 'cursor-not-allowed opacity-50'
			: ''}"
		onclick={() => (isOpen ? closePicker() : openPicker())}
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		aria-label="Choose chat model"
		{disabled}
	>
		{#if currentModel.logoUrl}
			<img src={currentModel.logoUrl} alt="" class="size-4 rounded-sm" />
		{:else}
			<div
				class="flex size-4 items-center justify-center rounded-sm bg-gray-200 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300"
			>
				{currentModel.displayName.slice(0, 1).toUpperCase()}
			</div>
		{/if}
		<span class="truncate font-medium">{currentModel.displayName}</span>
		{#if hasProviderOverride}
			{@const hubOrg =
				PROVIDERS_HUB_ORGS[currentProviderOverride as keyof typeof PROVIDERS_HUB_ORGS]}
			{#if hubOrg}
				<img
					src="https://huggingface.co/api/avatars/{hubOrg}"
					alt={currentProviderOverride}
					class="size-3 rounded-sm"
				/>
			{/if}
		{/if}
		<LucideChevronDown class="size-3.5 text-gray-400 dark:text-gray-500" />
	</button>

	{#if isOpen}
		<div
			class="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
			role="dialog"
			aria-label="Model selector"
		>
			<div class="flex h-96">
				<!-- Sidebar -->
				<div
					class="flex w-12 flex-col border-r border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/50"
				>
					{#each providerOptions as provider (provider.id)}
						<button
							type="button"
							class="group relative flex size-10 items-center justify-center rounded-md text-xs transition-colors {activeProvider ===
							provider.id
								? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
								: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300'}"
							onclick={() => {
								activeProvider = provider.id;
								highlightedIndex = 0;
							}}
							title={provider.label}
						>
							{#if activeProvider === provider.id}
								<div
									class="absolute right-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-l bg-gray-900 dark:bg-gray-100"
								></div>
							{/if}
							{#if provider.id === "all"}
								<span class="text-xs font-semibold">A</span>
							{:else if getProviderIconUrl(provider.id)}
								<img
									src={getProviderIconUrl(provider.id)!}
									alt={provider.label}
									class="size-5 rounded-sm"
								/>
							{:else}
								<span class="text-[10px] font-semibold uppercase"
									>{providerMonogram(provider.id)}</span
								>
							{/if}
						</button>
					{/each}
				</div>

				<!-- Main content -->
				<div class="flex min-w-0 flex-1 flex-col">
					<!-- Search -->
					<div
						class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
					>
						<CarbonSearch class="size-4 flex-none text-gray-400 dark:text-gray-500" />
						<input
							bind:this={searchInputEl}
							bind:value={modelFilter}
							type="search"
							placeholder="Search models..."
							aria-label="Search models"
							class="w-full border-0 bg-transparent p-0 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
						/>
					</div>

					<!-- Model list -->
					<div
						bind:this={listEl}
						class="scrollbar-custom flex-1 overflow-y-auto p-1"
						role="listbox"
						aria-label="Models"
					>
						{#if filteredModels.length}
							{#each filteredModels as model, index (model.id)}
								{@const isActive = model.id === currentModel.id}
								{@const isHighlighted = index === highlightedIndex}
								<div
									role="option"
									aria-selected={isActive}
									class="group flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors {isHighlighted
										? 'bg-gray-100 dark:bg-gray-700/50'
										: ''} {isActive
										? 'bg-gray-50 dark:bg-gray-700/30'
										: 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}"
									onclick={() => selectModel(model)}
									onmouseenter={() => (highlightedIndex = index)}
								>
									<!-- Favorite star -->
									<span
										class="mt-0.5 flex-none opacity-0 transition-opacity group-hover:opacity-100 {favorites.has(
											model.id
										)
											? 'opacity-100'
											: ''}"
										onclick={(e) => toggleFavorite(model.id, e)}
										aria-label={favorites.has(model.id)
											? "Remove from favorites"
											: "Add to favorites"}
									>
										{#if favorites.has(model.id)}
											<LucideStar class="size-3.5 fill-yellow-500 text-yellow-500" />
										{:else}
											<LucideStarOff class="size-3.5 text-gray-400 dark:text-gray-500" />
										{/if}
									</span>

									<!-- Model icon -->
									<div
										class="mt-0.5 flex size-7 flex-none items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-700"
									>
										{#if model.logoUrl}
											<img src={model.logoUrl} alt="" class="size-full object-cover" />
										{:else}
											<span class="text-[10px] font-semibold text-gray-600 dark:text-gray-300"
												>{model.displayName.slice(0, 1).toUpperCase()}</span
											>
										{/if}
									</div>

									<!-- Model info -->
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
												>{model.displayName}</span
											>
											{#if isActive}
												<CarbonCheckmark
													class="size-3.5 flex-none text-gray-900 dark:text-gray-100"
												/>
											{/if}
										</div>
										<p class="truncate text-xs text-gray-500 dark:text-gray-400">
											{modelDescription(model)}
										</p>
									</div>

									<!-- Capability badges -->
									<div class="flex flex-none items-center gap-1">
										{#if supportsTools(model)}
											<LucideHammer class="size-3 text-purple-500" title="Tool calling" />
										{/if}
										{#if supportsMultimodal(model)}
											<LucideImage class="size-3 text-sky-500" title="Multimodal" />
										{/if}
									</div>
								</div>
							{/each}
						{:else}
							<div class="flex h-full flex-col items-center justify-center px-4 text-center">
								<p class="text-sm font-medium text-gray-900 dark:text-gray-100">No models found</p>
								<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
									Try a different search term
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
