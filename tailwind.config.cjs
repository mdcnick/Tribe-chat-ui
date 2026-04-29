const defaultTheme = require("tailwindcss/defaultTheme");
const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	mode: "jit",
	content: ["./src/**/*.{html,js,svelte,ts}"],
	theme: {
		extend: {
			colors: {
				gray: {
					600: "#323843",
					700: "#252a33",
					800: "#1b1f27",
					900: "#12151c",
					950: "#07090d",
				},
				border: "oklch(var(--border) / <alpha-value>)",
				input: "oklch(var(--input) / <alpha-value>)",
				ring: "oklch(var(--ring) / <alpha-value>)",
				background: "oklch(var(--background) / <alpha-value>)",
				foreground: "oklch(var(--foreground) / <alpha-value>)",
				primary: {
					DEFAULT: "oklch(var(--primary) / <alpha-value>)",
					foreground: "oklch(var(--primary-foreground) / <alpha-value>)",
				},
				secondary: {
					DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
					foreground: "oklch(var(--secondary-foreground) / <alpha-value>)",
				},
				destructive: {
					DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
					foreground: "oklch(var(--destructive-foreground) / <alpha-value>)",
				},
				muted: {
					DEFAULT: "oklch(var(--muted) / <alpha-value>)",
					foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
				},
				accent: {
					DEFAULT: "oklch(var(--accent) / <alpha-value>)",
					foreground: "oklch(var(--accent-foreground) / <alpha-value>)",
				},
				popover: {
					DEFAULT: "oklch(var(--popover) / <alpha-value>)",
					foreground: "oklch(var(--popover-foreground) / <alpha-value>)",
				},
				card: {
					DEFAULT: "oklch(var(--card) / <alpha-value>)",
					foreground: "oklch(var(--card-foreground) / <alpha-value>)",
				},
				sidebar: {
					DEFAULT: "oklch(var(--sidebar) / <alpha-value>)",
					foreground: "oklch(var(--sidebar-foreground) / <alpha-value>)",
					primary: {
						DEFAULT: "oklch(var(--sidebar-primary) / <alpha-value>)",
						foreground: "oklch(var(--sidebar-primary-foreground) / <alpha-value>)",
					},
					accent: {
						DEFAULT: "oklch(var(--sidebar-accent) / <alpha-value>)",
						foreground: "oklch(var(--sidebar-accent-foreground) / <alpha-value>)",
					},
					border: "oklch(var(--sidebar-border) / <alpha-value>)",
					ring: "oklch(var(--sidebar-ring) / <alpha-value>)",
				},
				chart: {
					1: "oklch(var(--chart-1) / <alpha-value>)",
					2: "oklch(var(--chart-2) / <alpha-value>)",
					3: "oklch(var(--chart-3) / <alpha-value>)",
					4: "oklch(var(--chart-4) / <alpha-value>)",
					5: "oklch(var(--chart-5) / <alpha-value>)",
				},
			},
			fontSize: {
				xxs: "0.625rem",
				smd: "0.94rem",
			},
			fontFamily: {
				sans: [
					"Geist",
					"ui-sans-serif",
					"system-ui",
					"-apple-system",
					"BlinkMacSystemFont",
					"Segoe UI",
					"Roboto",
					"Helvetica Neue",
					"Arial",
					"sans-serif",
				],
				display: [
					"Instrument Serif",
					"ui-serif",
					"Georgia",
					"Cambria",
					"Times New Roman",
					"serif",
				],
				mono: [
					"JetBrains Mono",
					"ui-monospace",
					"SFMono-Regular",
					"Menlo",
					"Monaco",
					"Consolas",
					"monospace",
				],
			},
			boxShadow: {
				"glow-pink": "0 10px 40px -12px oklch(var(--primary) / 0.45)",
				"inset-pink": "inset 0 0 0 1px oklch(var(--primary) / 0.18)",
			},
		},
	},
	plugins: [
		require("tailwind-scrollbar")({ nocompatible: true }),
		require("@tailwindcss/typography"),
	],
};
