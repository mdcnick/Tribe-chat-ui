import path from "node:path";

type AppConfig = {
	port: number;
	publicBaseUrl: string;
	allowedHosts: string[];
	huggingFaceApiKey: string;
	defaultModelId: string;
	img2imgModelId: string;
	editModelId: string;
	storageDir: string;
};

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function getPublicBaseUrl(port: number): string {
	const explicit = process.env.PUBLIC_BASE_URL?.trim();
	if (explicit) return explicit.replace(/\/+$/, "");

	const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
	if (railwayDomain) return `https://${railwayDomain.replace(/\/+$/, "")}`;

	return `http://localhost:${port}`;
}

function getAllowedHosts(publicBaseUrl: string): string[] {
	const explicit = process.env.ALLOWED_HOSTS?.trim();
	if (explicit) {
		return explicit
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
	}

	const hosts = new Set<string>(["localhost", "127.0.0.1", "[::1]"]);
	try {
		hosts.add(new URL(publicBaseUrl).hostname);
	} catch {
		// Ignore malformed PUBLIC_BASE_URL here; startup will fail elsewhere if needed.
	}

	const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
	if (railwayDomain) {
		hosts.add(railwayDomain);
	}

	return [...hosts];
}

export function loadConfig(): AppConfig {
	const port = Number.parseInt(process.env.PORT ?? "3000", 10);
	if (!Number.isFinite(port) || port <= 0) {
		throw new Error(`Invalid PORT: ${process.env.PORT}`);
	}

	const publicBaseUrl = getPublicBaseUrl(port);

	return {
		port,
		publicBaseUrl,
		allowedHosts: getAllowedHosts(publicBaseUrl),
		huggingFaceApiKey: required("HUGGINGFACE_API_KEY"),
		defaultModelId:
			process.env.DEFAULT_MODEL_ID?.trim() || "black-forest-labs/FLUX.1-schnell",
		img2imgModelId:
			process.env.IMG2IMG_MODEL_ID?.trim() ||
			"stabilityai/stable-diffusion-xl-base-1.0",
		editModelId:
			process.env.EDIT_MODEL_ID?.trim() || "timbrooks/instruct-pix2pix",
		storageDir: path.resolve(process.cwd(), "storage/generated"),
	};
}

export type { AppConfig };
