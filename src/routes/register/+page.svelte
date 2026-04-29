<script lang="ts">
	import { enhance } from "$app/forms";
	import { base } from "$app/paths";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loading = $state(false);

	const containerClass =
		"min-h-screen flex items-center justify-center bg-background p-4";
	const cardClass =
		"w-full max-w-sm rounded-2xl border border-border bg-card/85 p-8 text-card-foreground shadow-2xl backdrop-blur";
	const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
	const inputClass =
		"w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";
	const primaryBtnClass =
		"inline-flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
</script>

<div class={containerClass}>
	<div class={cardClass}>
		<h1 class="mb-6 text-center text-xl font-semibold text-foreground">
			Create your account
		</h1>

		<p class="mb-6 text-center text-sm text-muted-foreground">
			No email required. Pick a PIN and you're in.
		</p>

		{#if form?.error}
			<div
				class="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			>
				{form.error}
			</div>
		{/if}

		{#if !data.loginEnabled}
			<p class="text-center text-sm text-muted-foreground">
				Registration is not configured.
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
					<label class={labelClass} for="username">
						Username
						<span class="text-muted-foreground/70">(leave blank for a random one)</span>
					</label>
					<input
						id="username"
						class={inputClass}
						type="text"
						name="username"
						autocomplete="username"
						placeholder="bold_fox_42"
						value={form?.username ?? ""}
					/>
				</div>

				<div class="mb-4">
					<label class={labelClass} for="pin">PIN</label>
					<input
						id="pin"
						class={inputClass}
						type="password"
						name="pin"
						autocomplete="new-password"
						inputmode="numeric"
						pattern="[0-9]*"
					maxlength="10"
					minlength="10"
					placeholder="10 digits"
						required
					/>
				</div>

				<div class="mb-4">
					<label class={labelClass} for="confirmPin">Confirm PIN</label>
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

				<div class="mb-5">
					<label class={labelClass} for="email">
						Email
						<span class="text-muted-foreground/70">(optional)</span>
					</label>
					<input
						id="email"
						class={inputClass}
						type="email"
						name="email"
						autocomplete="email"
						placeholder="you@example.com"
						value={form?.email ?? ""}
					/>
				</div>

				<button class={primaryBtnClass} type="submit" disabled={loading}>
					{#if loading}
						<span
							class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-gray-900 dark:border-t-transparent"
						></span>
					{/if}
					Create Account
				</button>
			</form>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				Already have an account?
				<a
					href="{base}/login"
					class="font-medium text-primary hover:underline"
				>
					Sign in →
				</a>
			</p>
		{/if}
	</div>
</div>