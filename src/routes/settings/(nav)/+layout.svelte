<script lang="ts">
	import { browser } from "$app/environment";
	import { afterNavigate, goto } from "$app/navigation";
	import { base } from "$app/paths";
	import { page } from "$app/state";
	import IconBurger from "$lib/components/icons/IconBurger.svelte";
	import IconCheap from "$lib/components/icons/IconCheap.svelte";
	import IconFast from "$lib/components/icons/IconFast.svelte";
	import IconOmni from "$lib/components/icons/IconOmni.svelte";
	import { useSettingsStore } from "$lib/stores/settings";
	import { debounce } from "$lib/utils/debounce";
	import { isDesktop } from "$lib/utils/isDesktop";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import CarbonChevronLeft from "~icons/carbon/chevron-left";
	import CarbonChevronDown from "~icons/carbon/chevron-down";
	import CarbonClose from "~icons/carbon/close";
	import CarbonTextLongParagraph from "~icons/carbon/text-long-paragraph";
	import IconGear from "~icons/bi/gear-fill";
	import LucideHammer from "~icons/lucide/hammer";
	import LucideImage from "~icons/lucide/image";
	import { onMount, tick } from "svelte";

	import type { LayoutData } from "../$types";

	const publicConfig = usePublicConfig();

	interface Props {
		data: LayoutData;
		children?: import("svelte").Snippet;
	}

	let { data, children }: Props = $props();

	let previousPage: string = $state(base || "/");
	let showContent: boolean = $state(false);
	let navContainer: HTMLDivElement | undefined = $state();

	async function scrollSelectedModelIntoView() {
		await tick();

		const container = navContainer;
		if (!container) return;

		const currentModelId = page.params.model as string | undefined;
		if (!currentModelId) return;

		const buttons = container.querySelectorAll<HTMLButtonElement>("button[data-model-id]");
		let target: HTMLElement | null = null;

		for (const btn of buttons) {
			if (btn.dataset.modelId === currentModelId) {
				target = btn;
				break;
			}
		}

		if (!target) return;
		target.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	function checkDesktopRedirect() {
		if (
			browser &&
			isDesktop(window) &&
			page.url.pathname === `${base}/settings` &&
			!page.url.pathname.endsWith("/application")
		) {
			goto(`${base}/settings/application`);
		}
	}

	onMount(() => {
		showContent = page.url.pathname !== `${base}/settings`;
		checkDesktopRedirect();
		void scrollSelectedModelIntoView();

		if (browser) {
			const debouncedCheck = debounce(checkDesktopRedirect, 100);
			window.addEventListener("resize", debouncedCheck);
			return () => window.removeEventListener("resize", debouncedCheck);
		}
	});

	afterNavigate(({ from }) => {
		if (from?.url && !from.url.pathname.includes("settings")) {
			previousPage = from.url.toString() || previousPage || base || "/";
		}

		showContent = page.url.pathname !== `${base}/settings`;
		checkDesktopRedirect();
		void scrollSelectedModelIntoView();
	});

	const settings = useSettingsStore();

	let modelFilter = $state("");
	const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
	let queryTokens = $derived(normalize(modelFilter).trim().split(/\s+/).filter(Boolean));

	function getModelProviders(model: (typeof data.models)[0]): string[] {
		const providers = model.providers ?? [];
		const names = providers
			.map((p) =>
				typeof p === "object" && p !== null ? (p as Record<string, unknown>).provider : undefined
			)
			.filter((p): p is string => typeof p === "string" && p.length > 0);
		return names.length > 0 ? names : ["Other"];
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
		};
		return (
			mapping[providerId] ?? providerId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
		);
	}

	let filteredModels = $derived(
		data.models
			.filter((el) => !el.unlisted)
			.filter((el) => {
				const haystack = normalize(`${el.id} ${el.name ?? ""} ${el.displayName ?? ""}`);
				return queryTokens.every((q) => haystack.includes(q));
			})
	);

	let groupedModels = $derived(() => {
		const groups = new Map<string, typeof filteredModels>();
		for (const model of filteredModels) {
			for (const provider of getModelProviders(model)) {
				let list = groups.get(provider);
				if (!list) {
					list = [];
					groups.set(provider, list);
				}
				list.push(model);
			}
		}
		return Array.from(groups.entries()).sort((a, b) => {
			// Always put Hugging Face first
			if (a[0] === "hf-inference") return -1;
			if (b[0] === "hf-inference") return 1;
			return a[0].localeCompare(b[0]);
		});
	});

	let expandedProviders = $state<Set<string>>(new Set(["hf-inference"]));

	function toggleProvider(provider: string) {
		const next = new Set(expandedProviders);
		if (next.has(provider)) {
			next.delete(provider);
		} else {
			next.add(provider);
		}
		expandedProviders = next;
	}

	$effect(() => {
		// Auto-expand providers that serve the currently selected model
		const currentModelId = page.params.model as string | undefined;
		if (currentModelId) {
			const model = data.models.find((m) => m.id === currentModelId);
			if (model) {
				const providers = getModelProviders(model);
				const next = new Set(expandedProviders);
				let changed = false;
				for (const provider of providers) {
					if (!next.has(provider)) {
						next.add(provider);
						changed = true;
					}
				}
				if (changed) expandedProviders = next;
			}
		}
	});

	$effect(() => {
		// Auto-expand all providers when searching
		if (queryTokens.length > 0) {
			const next = new Set(expandedProviders);
			for (const [provider] of groupedModels()) {
				next.add(provider);
			}
			expandedProviders = next;
		}
	});
</script>

<div
	class="mx-auto grid h-full w-full max-w-[1360px] grid-cols-1 grid-rows-[auto,1fr] gap-4 overflow-hidden px-3 pb-3 pt-3 text-gray-800 dark:text-gray-200 md:grid-cols-[320px,minmax(0,1fr)] md:px-4 md:pb-4"
>
	<div
		class="col-span-1 flex items-center gap-3 rounded-[28px] border border-gray-200/80 bg-white/80 px-3 py-3 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-gray-700/80 dark:bg-gray-800/80 dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_18px_40px_rgba(0,0,0,0.28)] md:col-span-2 md:px-4"
	>
		{#if showContent && browser}
			<button
				class="flex size-10 items-center justify-center rounded-2xl border border-gray-200 bg-white/80 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-700 md:hidden"
				aria-label="Back to menu"
				onclick={() => {
					showContent = false;
					goto(`${base}/settings`);
				}}
			>
				<IconBurger
					classNames="text-xl text-gray-900 hover:text-black dark:text-gray-200 dark:hover:text-white sm:hidden"
				/>
				<CarbonChevronLeft
					class="text-xl text-gray-900 hover:text-black dark:text-gray-200 dark:hover:text-white max-sm:hidden"
				/>
			</button>
		{/if}

		<div class="min-w-0 flex-1">
			<p
				class="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-500 dark:text-gray-400"
			>
				Settings
			</p>
			<div class="mt-1">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 md:text-xl">
					Account, preferences, and model behavior
				</h2>
				<p class="hidden text-sm text-gray-500 dark:text-gray-400 md:block">
					Adjust your app-wide defaults or tune how each model behaves.
				</p>
			</div>
		</div>

		<button
			class="flex size-10 items-center justify-center rounded-2xl border border-gray-200 bg-white/80 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-700"
			aria-label="Close settings"
			onclick={() => {
				goto(previousPage);
			}}
		>
			<CarbonClose class="text-xl text-gray-900 dark:text-gray-200" />
		</button>
	</div>

	{#if !(showContent && browser && !isDesktop(window))}
		<div
			class="scrollbar-custom col-span-1 flex min-h-0 flex-col overflow-y-auto rounded-[30px] border border-gray-200/80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(243,244,246,0.92))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_18px_40px_rgba(15,23,42,0.08)] dark:border-gray-700/80 dark:bg-[radial-gradient(circle_at_top,rgba(55,65,81,0.92),rgba(17,24,39,0.96))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_40px_rgba(0,0,0,0.28)]"
			class:max-md:hidden={showContent && browser}
			bind:this={navContainer}
		>
			<div
				class="sticky top-0 z-10 rounded-[24px] bg-white/70 p-2 backdrop-blur dark:bg-gray-800/70"
			>
				<div class="px-2 pb-2 pt-1">
					<p
						class="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400"
					>
						Model Library
					</p>
					<h3 class="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
						Choose what to configure
					</h3>
				</div>

				<label class="block">
					<span class="sr-only">Search models by name or id</span>
					<input
						bind:value={modelFilter}
						type="search"
						placeholder="Search models"
						aria-label="Search models by name or id"
						class="h-11 w-full rounded-2xl border border-gray-200 bg-white/80 px-4 text-sm text-gray-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
					/>
				</label>
			</div>

			<div class="mt-1 flex flex-col gap-2 px-1 pb-24">
				{#each groupedModels() as [provider, models] (provider)}
					<div class="flex flex-col">
						<button
							type="button"
							onclick={() => toggleProvider(provider)}
							class="group flex min-h-9 w-full items-center gap-2 rounded-[16px] border border-transparent px-2.5 py-1.5 text-left text-[13px] font-semibold text-gray-700 transition-colors hover:border-gray-200 hover:bg-white/80 hover:text-gray-900 dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-800/70 dark:hover:text-gray-100"
							aria-expanded={expandedProviders.has(provider)}
							aria-controls="provider-{provider}-models"
						>
							<CarbonChevronDown
								class="size-4 flex-none text-gray-400 transition-transform duration-200 dark:text-gray-500 {expandedProviders.has(
									provider
								)
									? 'rotate-180'
									: ''}"
							/>
							<span class="truncate">{providerDisplayName(provider)}</span>
							<span
								class="ml-auto flex-none rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700/60 dark:text-gray-400"
							>
								{models.length}
							</span>
						</button>

						{#if expandedProviders.has(provider)}
							<div id="provider-{provider}-models" class="mt-0.5 flex flex-col gap-0.5 pl-2">
								{#each models as model (model.id)}
									<button
										type="button"
										onclick={() => goto(`${base}/settings/${model.id}`)}
										class:model-active={model.id === page.params.model}
										class="group flex min-h-10 w-full items-center gap-2 rounded-[16px] border border-transparent px-3 py-1.5 text-left text-[13px] font-medium text-gray-600 transition-colors hover:border-gray-200 hover:bg-white/80 hover:text-gray-900 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-800/70 dark:hover:text-gray-100"
										data-model-id={model.id}
										aria-current={model.id === page.params.model ? "page" : undefined}
										aria-label="Configure {model.displayName}"
									>
										<div class="mr-auto flex min-w-0 items-center gap-1.5">
											<span class="truncate">{model.displayName}</span>
											{#if model.isRouter}
												<IconOmni />
											{/if}
										</div>

										{#if publicConfig.isHuggingChat && !model.isRouter && $settings.providerOverrides?.[model.id] && $settings.providerOverrides[model.id] !== "auto"}
											{@const providerOverride = $settings.providerOverrides[model.id]}
											{@const hubOrg =
												PROVIDERS_HUB_ORGS[providerOverride as keyof typeof PROVIDERS_HUB_ORGS]}
											{#if providerOverride === "fastest"}
												<span
													title="Provider: {providerOverride}"
													class="grid size-[21px] flex-none place-items-center rounded-md bg-green-500/10 text-green-600 dark:text-green-500"
													aria-label="Provider: {providerOverride}"
													role="img"
												>
													<IconFast classNames="size-3" />
												</span>
											{:else if providerOverride === "cheapest"}
												<span
													title="Provider: {providerOverride}"
													class="grid size-[21px] flex-none place-items-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-500"
													aria-label="Provider: {providerOverride}"
													role="img"
												>
													<IconCheap classNames="size-3" />
												</span>
											{:else if hubOrg}
												<span
													title="Provider: {providerOverride}"
													class="flex size-[21px] flex-none items-center justify-center rounded-md bg-gray-500/10 p-[0.225rem]"
												>
													<img
														src="https://huggingface.co/api/avatars/{hubOrg}"
														alt={providerOverride}
														class="size-full rounded"
													/>
												</span>
											{/if}
										{/if}

										{#if $settings.toolsOverrides?.[model.id] ?? (model as { supportsTools?: boolean }).supportsTools}
											<span
												title="Tool calling supported"
												class="grid size-[21px] flex-none place-items-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-500"
												aria-label="Model supports tools"
												role="img"
											>
												<LucideHammer class="size-3" />
											</span>
										{/if}

										{#if $settings.multimodalOverrides?.[model.id] ?? model.multimodal}
											<span
												title="Multimodal support (image inputs)"
												class="grid size-[21px] flex-none place-items-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-500"
												aria-label="Model is multimodal"
												role="img"
											>
												<LucideImage class="size-3" />
											</span>
										{/if}

										{#if $settings.customPrompts?.[model.id]}
											<CarbonTextLongParagraph
												class="size-6 rounded-md border border-gray-300 p-1 text-gray-800 dark:border-gray-600 dark:text-gray-200"
											/>
										{/if}

										{#if model.id === $settings.activeModel}
											<div
												class="flex h-[21px] items-center rounded-md bg-black/90 px-2 text-[11px] font-semibold leading-none text-white dark:bg-white dark:text-black"
											>
												Active
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="sticky bottom-0 z-10 mt-auto px-1 pb-1 pt-3">
				<button
					type="button"
					onclick={() => goto(`${base}/settings/application`)}
					class="group flex min-h-11 w-full items-center gap-2 rounded-[22px] border px-3 py-2 text-left text-[13px] font-semibold shadow-lg backdrop-blur transition-colors max-md:order-first {page
						.url.pathname === `${base}/settings/application`
						? 'border-gray-200 bg-white/95 text-gray-900 dark:border-gray-600 dark:bg-gray-700/95 dark:text-gray-100'
						: 'border-gray-200/70 bg-white/80 text-gray-600 hover:bg-white dark:border-gray-700/70 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-800'}"
					aria-current={page.url.pathname === `${base}/settings/application` ? "page" : undefined}
					aria-label="Configure application settings"
				>
					<IconGear class="text-xxs" />
					<div class="flex min-w-0 flex-1 flex-col">
						<span>Application Settings</span>
						<span class="text-[11px] font-normal text-gray-500 dark:text-gray-400">
							Account, preferences, billing
						</span>
					</div>
				</button>
			</div>
		</div>
	{/if}

	{#if showContent}
		<div
			class="scrollbar-custom col-span-1 min-h-0 w-full overflow-y-auto overflow-x-clip"
			class:max-md:hidden={!showContent && browser}
		>
			<div
				class="min-h-full rounded-[30px] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.9))] px-4 py-5 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_24px_48px_rgba(15,23,42,0.08)] dark:border-gray-700/80 dark:bg-[linear-gradient(180deg,rgba(31,41,55,0.96),rgba(17,24,39,0.92))] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_24px_48px_rgba(0,0,0,0.32)]"
			>
				<div class="mx-auto w-full max-w-5xl">
					{@render children?.()}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.model-active {
		border-color: rgba(229, 231, 235, 0.95);
		background: rgba(255, 255, 255, 0.96);
		color: rgb(17 24 39);
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
	}

	:global(.dark) .model-active {
		border-color: rgba(75, 85, 99, 0.95);
		background: rgba(55, 65, 81, 0.92);
		color: rgb(243 244 246);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
	}
</style>
