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
	class="sticky top-0 flex flex-none touch-none items-center justify-between px-1.5 py-3.5 max-sm:pt-0"
>
	<a
		class="flex select-none items-center rounded-xl text-lg font-semibold"
		href="{publicConfig.PUBLIC_ORIGIN}{base}/"
	>
		<Logo classNames="dark:invert mr-[2px]" />
		{publicConfig.PUBLIC_APP_NAME}
	</a>
	<a
		href={`${base}/`}
		onclick={handleNewChatClick}
		class="flex rounded-lg border bg-white px-2 py-0.5 text-center shadow-sm hover:shadow-none dark:border-gray-600 dark:bg-gray-700 sm:text-smd"
		title="Ctrl/Cmd + Shift + O"
	>
		New Chat
	</a>
</div>

<div
	class="scrollbar-custom flex touch-pan-y flex-col gap-1 overflow-y-auto rounded-r-xl border border-l-0 border-gray-100 from-gray-50 px-3 pb-3 pt-2 text-[.9rem] dark:border-transparent dark:from-gray-800/30 max-sm:bg-gradient-to-t md:bg-gradient-to-l"
>
	<div class="flex flex-col gap-0.5">
		{#each Object.entries(groupedConversations) as [group, convs]}
			{#if convs.length}
				<h4 class="mb-1.5 mt-4 pl-0.5 text-sm text-gray-400 first:mt-0 dark:text-gray-500">
					{titles[group]}
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

<div
	class="rounded-r-xl border border-l-0 border-gray-100 px-3 py-3 dark:border-transparent md:mt-3 md:bg-gradient-to-l md:from-gray-50 md:dark:from-gray-800/30"
>
	{#if user}
		<div
			class="rounded-2xl border border-gray-200/80 bg-white/70 p-3 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/70"
		>
			<div class="flex items-center gap-3">
				{#if userAvatar}
					<img
						src={userAvatar}
						class="size-10 rounded-full border border-gray-200 object-cover dark:border-gray-600"
						alt={userLabel}
					/>
				{:else}
					<div
						class="flex size-10 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
					>
						{userLabel.slice(0, 1).toUpperCase()}
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
						{userLabel}
					</div>
					{#if userSecondaryLabel}
						<div class="truncate text-xs text-gray-500 dark:text-gray-400">
							{userSecondaryLabel}
						</div>
					{/if}
				</div>
				{#if publicConfig.isHuggingChat && $isPro === false}
					<a
						href="https://huggingface.co/subscribe/pro?from=HuggingChat"
						target="_blank"
						rel="noopener noreferrer"
						class="flex h-[20px] items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
					>
						<IconPro />
						Get PRO
					</a>
				{:else if publicConfig.isHuggingChat && $isPro === true}
					<span
						class="flex h-[20px] items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
					>
						<IconPro />
						PRO
					</span>
				{/if}
			</div>

			<div class="mt-3 flex items-center gap-2">
				<a
					href="{base}/settings/application"
					class="flex h-9 flex-1 items-center justify-center rounded-xl bg-gray-100 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
					onclick={handleNavItemClick}
				>
					Account
				</a>
				<a
					href="{base}/logout"
					class="flex h-9 items-center justify-center rounded-xl border border-gray-200 px-3 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Log out
				</a>
			</div>
		</div>
	{:else if page.data.loginEnabled}
		<div
			class="rounded-2xl border border-dashed border-gray-300 bg-white/40 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300"
		>
			<div class="font-medium text-gray-900 dark:text-gray-100">Sign in to sync your chats</div>
			<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Access your conversations and settings across devices.
			</div>
			<a
				href="{base}/login?next={encodeURIComponent(page.url.pathname + page.url.search)}"
				class="mt-3 flex h-9 items-center justify-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
			>
				Continue
			</a>
		</div>
	{/if}
</div>

<div
	class="flex touch-none flex-col gap-1 rounded-r-xl border border-l-0 border-gray-100 p-3 text-sm dark:border-transparent md:mt-3 md:bg-gradient-to-l md:from-gray-50 md:dark:from-gray-800/30"
>
	<a
		href="{base}/models"
		class="flex h-9 flex-none items-center gap-1.5 rounded-lg pl-2 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 sm:h-[2.08rem]"
		onclick={handleNavItemClick}
	>
		Models
		<span
			class="ml-auto rounded-md bg-gray-500/5 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-gray-500/20 dark:text-gray-400"
			>{nModels}</span
		>
	</a>

	{#if user?.username || user?.email}
		<button
			onclick={() => (showMcpModal = true)}
			class="flex h-9 flex-none items-center gap-1.5 rounded-lg pl-2 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 sm:h-[2.08rem]"
		>
			MCP Servers
			{#if $enabledServersCount > 0}
				<span
					class="ml-auto rounded-md bg-blue-600/10 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-600/20 dark:text-blue-400"
				>
					{$enabledServersCount}
				</span>
			{/if}
		</button>
		<button
			onclick={handleOpenWorkspace}
			disabled={isSpawningWorkspace}
			class="flex h-9 flex-none items-center gap-1.5 rounded-lg pl-2 pr-2 text-gray-500 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700 sm:h-[2.08rem]"
		>
			Open Workspace
			{#if isSpawningWorkspace}
				<IconLoading classNames="ml-auto" />
			{/if}
		</button>
		{#if workspaceError}
			<span class="px-2 pb-1 text-xs text-red-500" role="alert">{workspaceError}</span>
		{/if}
	{/if}

	<span class="flex gap-1">
		<a
			href="{base}/settings/application"
			class="flex h-9 flex-none flex-grow items-center gap-1.5 rounded-lg pl-2 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
			onclick={handleNavItemClick}
		>
			Settings
		</a>
		<button
			onclick={() => {
				switchTheme();
			}}
			aria-label="Toggle theme"
			class="flex size-9 min-w-[1.5em] flex-none items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
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
