import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { InferenceClient } from "@huggingface/inference";

import type { AppConfig } from "./config.js";

type GenerateImageInput = {
	prompt: string;
	width?: number;
	height?: number;
	seed?: number;
	guidanceScale?: number;
	numInferenceSteps?: number;
	negativePrompt?: string;
	model?: string;
};

type ImageToImageInput = {
	imageUrl: string;
	prompt: string;
	strength?: number;
	seed?: number;
	guidanceScale?: number;
	numInferenceSteps?: number;
	model?: string;
};

type EditImageInput = {
	imageUrl: string;
	prompt: string;
	seed?: number;
	guidanceScale?: number;
	numInferenceSteps?: number;
	model?: string;
};

type GeneratedImage = {
	imageUrl: string;
	chatUiMarkdown: string;
	mimeType: string;
	model: string;
	fileName: string;
	width?: number;
	height?: number;
	seed?: number;
	prompt: string;
};

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

function inferExtension(mimeType: string): string {
	const lower = mimeType.toLowerCase();
	if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
	if (lower.includes("webp")) return "webp";
	return "png";
}

async function storeImageBlob(
	config: AppConfig,
	blob: Blob,
	mimeType: string,
	suggestedName?: string
) {
	const extension = inferExtension(mimeType);
	const baseName = suggestedName?.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
	const fileName = `${baseName || randomUUID()}.${extension}`;

	await mkdir(config.storageDir, { recursive: true });

	const arrayBuffer = await blob.arrayBuffer();
	await writeFile(path.join(config.storageDir, fileName), Buffer.from(arrayBuffer));

	const imageUrl = `${config.publicBaseUrl}/media/${fileName}`;
	return {
		imageUrl,
		fileName,
		mimeType,
		chatUiMarkdown: `![Generated image](${imageUrl})`,
	};
}

async function fetchImageBlob(url: string): Promise<Blob> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(60_000),
	});
	if (!response.ok) {
		throw new Error(
			`Failed to download source image from ${url}: ${response.status} ${response.statusText}`
		);
	}
	return response.blob();
}

function createClient(config: AppConfig): InferenceClient {
	return new InferenceClient(config.huggingFaceApiKey);
}

async function buildImageResult(
	config: AppConfig,
	blob: Blob,
	input: { prompt: string; seed?: number; width?: number; height?: number },
	model: string
): Promise<GeneratedImage> {
	const mimeType = blob.type || "image/png";
	const stored = await storeImageBlob(config, blob, mimeType);
	return {
		imageUrl: stored.imageUrl,
		chatUiMarkdown: stored.chatUiMarkdown,
		mimeType: stored.mimeType,
		model,
		fileName: stored.fileName,
		prompt: input.prompt,
		seed: input.seed,
		width: input.width,
		height: input.height,
	};
}

export async function generateImage(
	config: AppConfig,
	input: GenerateImageInput
): Promise<GeneratedImage> {
	const model = input.model?.trim() || config.defaultModelId;
	const width = input.width ?? DEFAULT_WIDTH;
	const height = input.height ?? DEFAULT_HEIGHT;

	const client = createClient(config);
	const blob = await client.textToImage(
		{
			model,
			inputs: input.prompt,
			parameters: {
				width,
				height,
				...(typeof input.seed === "number" ? { seed: input.seed } : {}),
				...(typeof input.guidanceScale === "number"
					? { guidance_scale: input.guidanceScale }
					: {}),
				...(typeof input.numInferenceSteps === "number"
					? { num_inference_steps: input.numInferenceSteps }
					: {}),
				...(input.negativePrompt?.trim()
					? { negative_prompt: input.negativePrompt.trim() }
					: {}),
			},
		},
		{ outputType: "blob" }
	);

	return await buildImageResult(config, blob, { ...input, width, height }, model);
}

export async function imageToImage(
	config: AppConfig,
	input: ImageToImageInput
): Promise<GeneratedImage> {
	const model = input.model?.trim() || config.img2imgModelId;
	const sourceBlob = await fetchImageBlob(input.imageUrl);

	const parameters: Record<string, unknown> = {
		prompt: input.prompt,
		...(typeof input.seed === "number" ? { seed: input.seed } : {}),
		...(typeof input.guidanceScale === "number"
			? { guidance_scale: input.guidanceScale }
			: {}),
		...(typeof input.numInferenceSteps === "number"
			? { num_inference_steps: input.numInferenceSteps }
			: {}),
		...(typeof input.strength === "number" ? { strength: input.strength } : {}),
	};

	const client = createClient(config);
	const blob = await client.imageToImage({
		model,
		inputs: sourceBlob,
		parameters,
	});

	return await buildImageResult(config, blob, input, model);
}

export async function editImage(
	config: AppConfig,
	input: EditImageInput
): Promise<GeneratedImage> {
	const model = input.model?.trim() || config.editModelId;
	const sourceBlob = await fetchImageBlob(input.imageUrl);

	const client = createClient(config);
	const blob = await client.imageToImage({
		model,
		inputs: sourceBlob,
		parameters: {
			prompt: input.prompt,
			...(typeof input.seed === "number" ? { seed: input.seed } : {}),
			...(typeof input.guidanceScale === "number"
				? { guidance_scale: input.guidanceScale }
				: {}),
			...(typeof input.numInferenceSteps === "number"
				? { num_inference_steps: input.numInferenceSteps }
				: {}),
		},
	});

	return await buildImageResult(config, blob, input, model);
}
