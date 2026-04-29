<script lang="ts" module>
	export const titles: { [key: string]: string } = {
		today: "Today",
		week: "This week",
		month: "This month",
		older: "Older",
	} as const;
</script>

<script lang="ts">
	import { base } from "$app/paths";

	import Logo from "$lib/components/icons/Logo.svelte";
	import IconSun from "$lib/components/icons/IconSun.svelte";
	import IconMoon from "$lib/components/icons/IconMoon.svelte";
	import { switchTheme, subscribeToTheme } from "$lib/switchTheme";
	import { isAborted } from "$lib/stores/isAborted";
	import { onDestroy } from "svelte";

	import NavConversationItem from "./NavConversationItem.svelte";
	import type { LayoutData } from "../../routes/$types";
	import type { ConvSidebar } from "$lib/types/ConvSidebar";
	import type { Model } from "$lib/types/Model";
	import { page } from "$app/state";
	import InfiniteScroll from "./InfiniteScroll.svelte";
	import { CONV_NUM_PER_PAGE } from "$lib/constants/pagination";
	import { browser } from "$app/environment";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	import { useAPIClient, handleResponse } from "$lib/APIClient";
	import { requireAuthUser } from "$lib/utils/auth";
	import { enabledServersCount } from "$lib/stores/mcpServers";
	import { isPro } from "$lib/stores/isPro";
	import IconPro from "$lib/components/icons/IconPro.svelte";
	import IconLoading from "$lib/components/icons/IconLoading.svelte";
	import MCPServerManager from "./mcp/MCPServerManager.svelte";

	const publicConfig = usePublicConfig();
	const client = useAPIClient();

	interface Props {
		conversations: ConvSidebar[];
		user: LayoutData["user"];
		p?: number;
		ondeleteConversation?: (id: string) => void;
		oneditConversationTitle?: (payload: { id: string; title: string }) => void;
	}

	let {
		conversations = $bindable(),
		user,
		p = $bindable(0),
		ondeleteConversation,
		oneditConversationTitle,
	}: Props = $props();

	let hasMore = $state(true);

	function handleNewChatClick(e: MouseEvent) {
		isAborted.set(true);

		if (requireAuthUser()) {
			e.preventDefault();
		}
	}

	function handleNavItemClick(e: MouseEvent) {
		if (requireAuthUser()) {
			e.preventDefault();
		}
	}

	const dateRanges = [
		new Date().setDate(new Date().getDate() - 1),
		new Date().setDate(new Date().getDate() - 7),
		new Date().setMonth(new Date().getMonth() - 1),
	];

	let groupedConversations = $derived({
		today: conversations.filter(({ updatedAt }) => updatedAt.getTime() > dateRanges[0]),
		week: conversations.filter(
			({ updatedAt }) => updatedAt.getTime() > dateRanges[1] && updatedAt.getTime() < dateRanges[0]
		),
		month: conversations.filter(
			({ updatedAt }) => updatedAt.getTime() > dateRanges[2] && updatedAt.getTime() < dateRanges[1]
		),
		older: conversations.filter(({ updatedAt }) => updatedAt.getTime() < dateRanges[2]),
	});

	const nModels: number = page.data.models.filter((el: Model) => !el.unlisted).length;

	async function handleVisible() {
		p++;
		const newConvs = await client.conversations
			.get({
				query: {
					p,
				},
			})
			.then(handleResponse)
			.then((r) => r.conversations)
			.catch((): ConvSidebar[] => []);

		if (newConvs.length === 0) {
			hasMore = false;
		}

		conversations = [...conversations, ...newConvs];
	}

	$effect(() => {
		if (conversations.length <= CONV_NUM_PER_PAGE) {
			// reset p to 0 if there's only one page of content
			// that would be caused by a data loading invalidation
			p = 0;
		}
	});

	let isDark = $state(false);
	let unsubscribeTheme: (() => void) | undefined;
	let showMcpModal = $state(false);
	let isSpawningWorkspace = $state(false);
	let workspaceError: string | null = $state(null);

	async function handleOpenWorkspace() {
		if (isSpawningWorkspace) return;
		isSpawningWorkspace = true;
		workspaceError = null;
		try {
			const res = await fetch(`${base}/api/v2/agent/spawn`, { method: "POST" });
			if (!res.ok) {
				const body = await res.text().catch(() => res.statusText);
				throw new Error(body || `HTTP ${res.status}`);
			}
			const data = (await res.json()) as { desktopUrl?: string };
			if (!data.desktopUrl) {
				throw new Error("Spawn response missing desktopUrl");
			}
			window.open(data.desktopUrl, "_blank", "noopener,noreferrer");
		} catch (err) {
			workspaceError = err instanceof Error ? err.message : String(err);
		} finally {
			isSpawningWorkspace = false;
		}
	}

	if (browser) {
		unsubscribeTheme = subscribeToTheme(({ isDark: nextIsDark }) => {
			isDark = nextIsDark;
		});
	}

	onDestroy(() => {
		unsubscribeTheme?.();
	});

	const userLabel = $derived(user?.name || user?.username || user?.email || "Account");
	const userSecondaryLabel = $derived(
		user?.email && user?.email !== userLabel
			? user.email
			: user?.username && user?.username !== userLabel
				? user.username
				: undefined
	);
	const userAvatar = $derived(user?.avatarUrl || undefined);
</script>

<div
	class="sticky top-0 z-10 flex flex-none touch-none flex-col gap-3 bg-sidebar/85 px-3 pb-2 pt-4 backdrop-blur-md max-sm:pt-2"
>
	<a
		class="group flex select-none items-center gap-1 rounded-xl px-1 text-lg font-semibold text-sidebar-foreground"
		href="{publicConfig.PUBLIC_ORIGIN}{base}/"
	>
		<Logo classNames="mr-[2px] transition-transform group-hover:scale-110" />
		<span class="font-display text-[1.55rem] leading-none tracking-tight"
			>{publicConfig.PUBLIC_APP_NAME}</span
		>
	</a>
	<a
		href={`${base}/`}
		onclick={handleNewChatClick}
		class="group/nc relative flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground shadow-glow-pink transition-all hover:translate-y-[-1px] hover:brightness-105 active:translate-y-0"
		title="Ctrl/Cmd + Shift + O"
	>
		<span
			class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover/nc:translate-x-full"
		></span>
		<span class="relative">New Chat</span>
		<kbd
			class="relative ml-auto hidden rounded-md bg-white/15 px-1.5 py-px text-[10px] font-mono tracking-wide text-primary-foreground/90 sm:inline-flex"
			>⌘⇧O</kbd
		>
	</a>
</div>

<div
	class="scrollbar-custom flex touch-pan-y flex-col gap-1 overflow-y-auto bg-sidebar/40 px-3 pb-3 pt-1 text-[.9rem]"
>
	<div class="flex flex-col gap-0.5">
		{#each Object.entries(groupedConversations) as [group, convs]}
			{#if convs.length}
				<h4
					class="mb-1.5 mt-5 flex items-center gap-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/75 first:mt-1"
				>
					<span class="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent"></span>
					{titles[group]}
					<span class="h-px flex-[3] bg-gradient-to-l from-primary/30 to-transparent"></span>
				</h4>
				{#each convs as conv}
					<NavConversationItem {conv} {oneditConversationTitle} {ondeleteConversation} />
				{/each}
			{/if}
		{/each}
	</div>
	{#if hasMore}
		<InfiniteScroll onvisible={handleVisible} />
	{/if}
</div>

<div class="px-3 py-3">
	{#if user}
		<div
			class="rounded-2xl border border-sidebar-border/70 bg-card/70 p-3 shadow-[0_1px_0_oklch(var(--primary)/0.08)] backdrop-blur-sm"
		>
			<div class="flex items-center gap-3">
				{#if userAvatar}
					<img
						src={userAvatar}
						class="size-10 rounded-full object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-card"
						alt={userLabel}
					/>
				{:else}
					<div
						class="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-5 text-sm font-semibold text-primary-foreground shadow-glow-pink"
					>
						{userLabel.slice(0, 1).toUpperCase()}
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium text-card-foreground">
						{userLabel}
					</div>
					{#if userSecondaryLabel}
						<div class="truncate text-xs text-muted-foreground">
							{userSecondaryLabel}
						</div>
					{/if}
				</div>
				{#if publicConfig.isHuggingChat && $isPro === false}
					<a
						href="https://huggingface.co/subscribe/pro?from=HuggingChat"
						target="_blank"
						rel="noopener noreferrer"
						class="flex h-[20px] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary"
					>
						<IconPro />
						Get PRO
					</a>
				{:else if publicConfig.isHuggingChat && $isPro === true}
					<span
						class="flex h-[20px] items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary"
					>
						<IconPro />
						PRO
					</span>
				{/if}
			</div>

			<div class="mt-3 flex items-center gap-2">
				<a
					href="{base}/settings/application"
					class="flex h-9 flex-1 items-center justify-center rounded-xl bg-secondary/80 px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					onclick={handleNavItemClick}
				>
					Account
				</a>
				<a
					href="{base}/logout"
					class="flex h-9 items-center justify-center rounded-xl border border-sidebar-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-secondary-foreground"
				>
					Log out
				</a>
			</div>
		</div>
	{:else if page.data.loginEnabled}
		<div
			class="rounded-2xl border border-dashed border-primary/40 bg-primary/[0.06] p-3 text-sm text-muted-foreground"
		>
			<div class="font-medium text-card-foreground">Save your chats</div>
			<div class="mt-1 text-xs text-muted-foreground">
				Create a free account to keep your conversations across devices.
			</div>
			<a
				href="{base}/login?next={encodeURIComponent(page.url.pathname + page.url.search)}"
				class="mt-3 flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground shadow-glow-pink transition-all hover:translate-y-[-1px] hover:brightness-105"
			>
				Continue
			</a>
		</div>
	{/if}
</div>

<div class="flex touch-none flex-col gap-0.5 px-3 pb-3 text-sm">
	<a
		href="{base}/models"
		class="flex h-9 flex-none items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-[2.08rem]"
		onclick={handleNavItemClick}
	>
		Models
		<span
			class="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary"
			>{nModels}</span
		>
	</a>

	{#if user?.username || user?.email}
		<button
			onclick={() => (showMcpModal = true)}
			class="flex h-9 flex-none items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-[2.08rem]"
		>
			MCP Servers
			{#if $enabledServersCount > 0}
				<span
					class="ml-auto rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary"
				>
					{$enabledServersCount}
				</span>
			{/if}
		</button>
		<button
			onclick={handleOpenWorkspace}
			disabled={isSpawningWorkspace}
			class="flex h-9 flex-none items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-wait disabled:opacity-60 sm:h-[2.08rem]"
		>
			Open Workspace
			{#if isSpawningWorkspace}
				<IconLoading classNames="ml-auto" />
			{/if}
		</button>
		{#if workspaceError}
			<span class="px-2 pb-1 text-xs text-destructive" role="alert">{workspaceError}</span>
		{/if}
	{/if}

	<span class="mt-1 flex gap-1">
		<a
			href="{base}/settings/application"
			class="flex h-9 flex-none flex-grow items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			onclick={handleNavItemClick}
		>
			Settings
		</a>
		<button
			onclick={() => {
				switchTheme();
			}}
			aria-label="Toggle theme"
			class="flex size-9 min-w-[1.5em] flex-none items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
		>
			{#if browser}
				{#if isDark}
					<IconSun />
				{:else}
					<IconMoon />
				{/if}
			{/if}
		</button>
	</span>
</div>

{#if showMcpModal}
	<MCPServerManager onclose={() => (showMcpModal = false)} />
{/if}
