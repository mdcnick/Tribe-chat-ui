<script lang="ts">
	import { enhance } from "$app/forms";
	import { base } from "$app/paths";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loading = $state(false);

	const containerClass =
		"min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-4 dark:from-gray-900 dark:to-gray-950";
	const cardClass =
		"w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white/85 p-8 shadow-2xl backdrop-blur dark:border-gray-700/80 dark:bg-gray-800/85";
	const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
	const inputClass =
		"w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[15px] text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-gray-700";
	const primaryBtnClass =
		"inline-flex w-full items-center justify-center rounded-xl border border-gray-900 bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white";
	const oauthBtnClass =
		"flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";
</script>

<div class={containerClass}>
	<div class={cardClass}>
		<h1 class="mb-6 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
			Sign in
		</h1>

		{#if data.error || form?.error}
			<div
				class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
			>
				{#if data.error === "rate-limit"}
					Too many attempts. Please wait a moment.
				{:else if data.error === "session-expired"}
					Your session expired. Please sign in again.
				{:else}
					{form?.error ?? "Something went wrong. Please try again."}
				{/if}
			</div>
		{/if}

		{#if !data.loginEnabled}
			<p class="text-center text-sm text-gray-500 dark:text-gray-400">
				Login is not configured. Set <code class="font-mono text-xs">BETTER_AUTH_SECRET</code> to
				enable it.
			</p>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="next" value={data.next} />

				<div class="mb-4">
					<label class={labelClass} for="email">Email</label>
					<input
						id="email"
						class={inputClass}
						type="email"
						name="email"
						autocomplete="email"
						placeholder="you@example.com"
						value={form?.email ?? ""}
						required
					/>
				</div>

				<div class="mb-2">
					<div class="mb-1.5 flex items-center justify-between">
						<label class={labelClass} for="password">Password</label>
						<a
							href="{base}/forgot-password"
							class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						>
							Forgot?
						</a>
					</div>
					<input
						id="password"
						class={inputClass}
						type="password"
						name="password"
						autocomplete="current-password"
						placeholder="••••••••"
						required
					/>
				</div>

				<button class="{primaryBtnClass} mt-5" type="submit" disabled={loading}>
					{#if loading}
						<span class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-gray-900 dark:border-t-transparent"
						></span>
					{/if}
					Sign In
				</button>
			</form>

			{#if data.githubEnabled || data.googleEnabled}
				<div class="my-5 flex items-center gap-3">
					<span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
					<span class="text-xs text-gray-400">or</span>
					<span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
				</div>

				<div class="flex flex-col gap-2">
					{#if data.githubEnabled}
						<a href="{base}/api/auth/sign-in/social?provider=github&callbackURL={encodeURIComponent(data.next)}" class={oauthBtnClass}>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
							</svg>
							Continue with GitHub
						</a>
					{/if}
					{#if data.googleEnabled}
						<a href="{base}/api/auth/sign-in/social?provider=google&callbackURL={encodeURIComponent(data.next)}" class={oauthBtnClass}>
							<svg class="h-4 w-4" viewBox="0 0 24 24">
								<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
								<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
								<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
								<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
							</svg>
							Continue with Google
						</a>
					{/if}
				</div>
			{/if}

			<p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
				New here?
				<a
					href="{base}/register"
					class="font-medium text-gray-900 hover:underline dark:text-gray-100"
				>
					Create an account →
				</a>
			</p>
		{/if}
	</div>
</div>
