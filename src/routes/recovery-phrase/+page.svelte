<script lang="ts">
	import { base } from "$app/paths";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	let downloaded = $state(false);
	let confirmed = $state(false);
	let copied = $state(false);
	const containerClass =
		"min-h-screen flex items-center justify-center bg-background p-4";
	const cardClass =
		"w-full max-w-lg rounded-2xl border border-border bg-card/85 p-8 text-card-foreground shadow-2xl backdrop-blur";

	async function downloadPhrase() {
		const text = `ChatUI Recovery Key for: ${data.username}\n\n${data.recoveryPhrase}\n\nKeep this safe. Anyone with these words can reset your PIN.\nNever share them with anyone.\nGenerated: ${new Date().toISOString()}`;
		const blob = new Blob([text], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `chatui-recovery-${data.username}.txt`;
		a.click();
		URL.revokeObjectURL(url);
		downloaded = true;
	}

	function copyPhrase() {
		navigator.clipboard.writeText(data.recoveryPhrase);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class={containerClass}>
	<div class={cardClass}>
		<!-- Warning header -->
		<div class="mb-6 flex items-start gap-3">
			<div
				class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
			>
				<svg class="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
			<div>
				<h1 class="text-lg font-semibold text-foreground">
					Save your recovery phrase
				</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					This is the <strong>only time</strong> you'll see these words. Save them somewhere safe.
				</p>
			</div>
		</div>

		<!-- Recovery phrase display -->
		<div
			class="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20"
		>
			<p class="mb-2 text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
				Recovery Phrase
			</p>
			<p
				class="select-all font-mono text-sm leading-relaxed text-foreground"
			>
				{data.recoveryPhrase}
			</p>
		</div>

		<!-- Action buttons -->
		<div class="mb-6 flex gap-3">
			<button
				class="flex-1 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80"
				onclick={copyPhrase}
			>
				{#if copied}
					Copied!
				{:else}
					Copy
				{/if}
			</button>
			<button
				class="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
				onclick={downloadPhrase}
			>
				{#if downloaded}
					✓ Downloaded
				{:else}
					Download .txt
				{/if}
			</button>
		</div>

		<!-- Confirmation -->
		{#if !confirmed}
			<div class="mb-4 rounded-xl border border-border bg-muted/50 p-4">
				<label class="flex items-start gap-3">
					<input
						type="checkbox"
						class="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
						bind:checked={confirmed}
					/>
					<span class="text-sm text-muted-foreground">
						I've saved my recovery phrase in a secure location.
						<strong class="text-foreground"
							>If you lose it, you cannot recover your account.</strong
						>
					</span>
				</label>
			</div>

			<a
				href="{base}/"
				class="block rounded-xl border border-border bg-muted px-3 py-2.5 text-center text-sm font-medium text-muted-foreground shadow-sm"
				aria-disabled="true"
			>
				Continue to Chat
			</a>
		{:else}
			<a
				href="{base}/"
				class="block rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
			>
				Continue to Chat
			</a>
		{/if}

		<!-- Info -->
		<div class="mt-6 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
			<h3 class="mb-1 text-sm font-medium text-blue-800 dark:text-blue-300">Why do I need this?</h3>
			<p class="text-xs text-blue-700 dark:text-blue-400">
				Your recovery phrase lets you reset your PIN if you forget it. We don't store it —
				only you have it. Keep it somewhere safe, like a password manager or a piece of paper in
				a locked drawer.
			</p>
		</div>
	</div>
</div>