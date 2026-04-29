<script lang="ts">
	import { enhance } from "$app/forms";
	import { base } from "$app/paths";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loading = $state(false);

	const containerClass =
		"min-h-screen flex items-center justify-center bg-background p-4";
	const cardClass =
		"w-full max-w-lg rounded-2xl border border-border bg-card/85 p-8 text-card-foreground shadow-2xl backdrop-blur";
	const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
	const inputClass =
		"w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";
	const primaryBtnClass =
		"inline-flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
	const dangerBtnClass =
		"inline-flex w-full items-center justify-center rounded-xl bg-destructive/15 border border-destructive/40 px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/25 disabled:opacity-50";

</script>

<div class={containerClass}>
	<div class={cardClass}>
		{#if form?.success}
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
				>
					<svg class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h1 class="mb-2 text-xl font-semibold text-foreground">
					PIN Reset Successful
				</h1>
				<p class="text-sm text-muted-foreground">
					Your PIN has been changed. You can now sign in with your new PIN.
				</p>
				<a
					href="{base}/login"
					class="mt-4 inline-block text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
				>
					Sign in →
				</a>
			</div>
		{:else}
			<h1 class="mb-6 text-center text-xl font-semibold text-foreground">
				Reset PIN
			</h1>

			<p class="mb-6 text-sm text-muted-foreground">
				Enter your 12-word recovery phrase to set a new PIN.
			</p>

			{#if form?.error}
				<div
					class="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
				>
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				action="?/reset"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
>
				<div class="mb-4">
					<label class={labelClass} for="recoveryPhrase"
						>Recovery Phrase
						<span class="text-muted-foreground/70">(12 words)</span></label
					>
					<textarea
						id="recoveryPhrase"
						class="{inputClass} min-h-[80px] resize-y"
						name="recoveryPhrase"
						placeholder="word1 word2 word3 ... word12"
						required
					></textarea>
				</div>

				<div class="mb-4">
					<label class={labelClass} for="newPin">New PIN</label>
					<input
						id="newPin"
						class={inputClass}
						type="password"
						name="newPin"
						autocomplete="new-password"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="10"
						minlength="10"
						placeholder="10 digits"
						required
					/>
				</div>

				<div class="mb-5">
					<label class={labelClass} for="confirmPin">Confirm New PIN</label>
					<input
						id="confirmPin"
						class={inputClass}
						type="password"
						name="confirmPin"
						autocomplete="new-password"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="10"
						minlength="10"
						placeholder="Re-enter 10-digit PIN"
						required
					/>
				</div>

				<button class={dangerBtnClass} type="submit" disabled={loading}>
					{#if loading}
						<span
							class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent dark:border-gray-900 dark:border-t-transparent"
						></span>
					{/if}
					Reset PIN
				</button>
			</form>
		{/if}
	</div>
</div>