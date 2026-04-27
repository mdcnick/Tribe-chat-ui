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
</script>

<div class={containerClass}>
	<div class={cardClass}>
		<h1 class="mb-6 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
			Set new password
		</h1>

		{#if !data.hasToken || form?.expired}
			<div
				class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
			>
				<p class="font-medium">Link expired or invalid</p>
				<p class="mt-1 text-xs">
					<a
						href="{base}/forgot-password"
						class="font-medium text-red-600 hover:underline dark:text-red-400"
					>
						Request a new one →
					</a>
				</p>
			</div>
		{:else}
			{#if form?.error && !form?.expired}
				<div
					class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
				>
					{form.error}
				</div>
			{/if}

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
				<input type="hidden" name="token" value={data.token ?? ""} />

				<div class="mb-4">
					<label class={labelClass} for="password">New password</label>
					<input
						id="password"
						class={inputClass}
						type="password"
						name="password"
						autocomplete="new-password"
						placeholder="••••••••"
						minlength="8"
						required
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Min. 8 characters</p>
				</div>

				<div class="mb-4">
					<label class={labelClass} for="confirm">Confirm new password</label>
					<input
						id="confirm"
						class={inputClass}
						type="password"
						name="confirm"
						autocomplete="new-password"
						placeholder="••••••••"
						required
					/>
				</div>

				<button class="{primaryBtnClass} mt-2" type="submit" disabled={loading}>
					{#if loading}
						<span class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-gray-900 dark:border-t-transparent"
						></span>
					{/if}
					Reset Password
				</button>
			</form>
		{/if}

		<p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
			<a
				href="{base}/login"
				class="font-medium text-gray-900 hover:underline dark:text-gray-100"
			>
				← Back to sign in
			</a>
		</p>
	</div>
</div>
