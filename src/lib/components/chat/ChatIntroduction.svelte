<script lang="ts">
	import type { Model } from "$lib/types/Model";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		currentModel: Model;
		onmessage?: (content: string) => void;
	}

	let { currentModel: _currentModel, onmessage }: Props = $props();

	const categories = [
		{ key: "create", label: "Create", icon: "✨" },
		{ key: "explore", label: "Explore", icon: "🪐" },
		{ key: "code", label: "Code", icon: "</>" },
		{ key: "learn", label: "Learn", icon: "🎓" },
	] as const;

	type CategoryKey = (typeof categories)[number]["key"];

	const prompts: Record<CategoryKey, string[]> = {
		create: [
			"Write a short story about a lighthouse keeper who befriends a comet",
			"Design a minimalist logo brief for a botanical perfume brand",
			"Draft a heartfelt birthday message for a longtime mentor",
			"Invent a board game set inside a sleepy coastal town",
		],
		explore: [
			"What's the best way to visit Kyoto in cherry blossom season?",
			"Compare living costs between Lisbon, Berlin, and Buenos Aires",
			"Suggest a weekend reading list on the history of cartography",
			"What are some underrated museums in Mexico City?",
		],
		code: [
			"Refactor this idea: a TypeScript debounce that supports leading & trailing",
			"Walk me through a Rust port of a small Python web scraper",
			"Why is my React effect firing twice and how do I stop it cleanly?",
			"Sketch a SQL query to find users with three sessions in seven days",
		],
		learn: [
			"Explain transformers like I'm a curious 14-year-old",
			"Give me a five-minute primer on stoicism and why it endures",
			"How does prompt caching actually save money in LLM apps?",
			"Walk me through how mortgages compound interest, step by step",
		],
	};

	let active = $state<CategoryKey>("create");
	let activePrompts = $derived(prompts[active]);

	function send(text: string) {
		onmessage?.(text);
	}

	$effect(() => {
		void _currentModel;
	});
</script>

<div
	class="mx-auto flex h-full w-full max-w-2xl flex-col justify-center px-2 pb-24 pt-12 sm:pt-16"
>
	<div class="mb-9 flex flex-col gap-2">
		<span
			class="font-mono text-[11px] uppercase tracking-[0.32em] text-primary/70"
			>welcome back, friend</span
		>
		<h1
			class="font-display text-balance text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl"
		>
			How can I help you today<span class="text-primary">?</span>
		</h1>
		<p class="mt-2 max-w-lg text-balance text-base text-muted-foreground">
			A cozy little corner powered by {publicConfig.PUBLIC_APP_NAME}. Pick a path or just start
			typing — there's no wrong way in.
		</p>
	</div>

	<div class="mb-5 flex flex-wrap gap-2">
		{#each categories as cat}
			<button
				type="button"
				onclick={() => (active = cat.key)}
				class={[
					"group inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all",
					active === cat.key
						? "border-transparent bg-primary text-primary-foreground shadow-glow-pink"
						: "border-sidebar-border bg-card/60 text-card-foreground/80 hover:-translate-y-px hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
				].join(" ")}
			>
				<span class="text-base leading-none">{cat.icon}</span>
				<span>{cat.label}</span>
			</button>
		{/each}
	</div>

	<ul class="flex flex-col divide-y divide-sidebar-border/60 overflow-hidden rounded-2xl border border-sidebar-border/60 bg-card/40 backdrop-blur-sm">
		{#each activePrompts as prompt, idx}
			<li>
				<button
					type="button"
					onclick={() => send(prompt)}
					class="group/item flex w-full items-center gap-3 px-4 py-3 text-left text-[0.95rem] text-card-foreground/85 transition-colors hover:bg-accent/70 hover:text-foreground"
				>
					<span
						class="flex size-7 flex-none items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-mono text-[11px] font-semibold text-primary transition-all group-hover/item:bg-primary group-hover/item:text-primary-foreground"
					>
						{String(idx + 1).padStart(2, "0")}
					</span>
					<span class="flex-1 leading-snug">{prompt}</span>
					<span
						class="text-primary opacity-0 transition-all group-hover/item:translate-x-0 group-hover/item:opacity-100 -translate-x-1"
						aria-hidden="true">→</span
					>
				</button>
			</li>
		{/each}
	</ul>
</div>
