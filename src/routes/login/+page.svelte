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
			Sign in
		</h1>

		{#if data.error || form?.error}
			<div
				class="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
			<p class="text-center text-sm text-muted-foreground">
				Login is not configured.
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
					<label class={labelClass} for="username">Username</label>
					<input
						id="username"
						class={inputClass}
						type="text"
						name="username"
						autocomplete="username"
						placeholder="bold_fox_42"
						value={form?.username ?? ""}
						required
					/>
				</div>

				<div class="mb-5">
					<label class={labelClass} for="pin">PIN</label>
					<input
						id="pin"
						class={inputClass}
						type="password"
						name="pin"
						autocomplete="current-password"
						inputmode="numeric"
						pattern="[0-9]*"
maxlength="10"
minlength="10"
placeholder="••••••••••"
					/>
			</div>

			<a
				href="{base}/recovery"
				class="mt-2 block text-center text-sm text-muted-foreground hover:underline"
			>
				Forgot PIN?
			</a>

				<button class={primaryBtnClass} type="submit" disabled={loading}>
					{#if loading}
						<span
							class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
						></span>
					{/if}
					Sign In
				</button>
			</form>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				New here?
				<a
					href="{base}/register"
					class="font-medium text-primary hover:underline"
				>
					Create an account →
				</a>
			</p>
		{/if}
	</div>
</div>