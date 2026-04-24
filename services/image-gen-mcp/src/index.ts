import express, { type Request, type Response } from "express";
import { mkdir } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import * as z from "zod/v4";

import { loadConfig } from "./config.js";
import { generateImage, imageToImage, editImage } from "./image.js";

const config = loadConfig();

function createServer() {
	const server = new McpServer(
		{
			name: "image-gen-mcp",
			version: "0.1.0",
		},
		{ capabilities: { logging: {} } }
	);

	server.registerTool(
		"generate_image",
		{
			description:
				"Generate an image from a text prompt using a Hugging Face diffusion model. Use this when the user wants to create a new image, illustration, artwork, or visual concept from scratch. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an inline image with lightbox support.",
			inputSchema: {
				prompt: z
					.string()
					.min(8)
					.max(2000)
					.describe(
						"Detailed image prompt describing the subject, style, composition, lighting, mood, and any specific details."
					),
				width: z
					.number()
					.int()
					.min(256)
					.max(2048)
					.optional()
					.describe("Output width in pixels. Default is 1024."),
				height: z
					.number()
					.int()
					.min(256)
					.max(2048)
					.optional()
					.describe("Output height in pixels. Default is 1024."),
				seed: z
					.number()
					.int()
					.min(0)
					.max(2_147_483_647)
					.optional()
					.describe("Optional deterministic seed for reproducibility."),
				guidance_scale: z
					.number()
					.min(0)
					.max(20)
					.optional()
					.describe(
						"Guidance scale. Higher values make the output more closely match the prompt. For FLUX.1-schnell the default is 0; for other models typically 7.5."
					),
				num_inference_steps: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe(
						"Number of denoising steps. More steps usually improve quality but increase latency. For FLUX.1-schnell the default is 4; for other models typically 50."
					),
				negative_prompt: z
					.string()
					.max(1000)
					.optional()
					.describe("Optional description of what to avoid in the generated image."),
				model: z
					.string()
					.min(3)
					.optional()
					.describe(
						"Optional Hugging Face model ID override. Leave unset to use the server default model."
					),
			},
			outputSchema: {
				image_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				model: z.string(),
				file_name: z.string(),
				prompt: z.string(),
				width: z.number().int().optional(),
				height: z.number().int().optional(),
				seed: z.number().int().optional(),
			},
		},
		async ({ prompt, width, height, seed, guidance_scale, num_inference_steps, negative_prompt, model }) => {
			const result = await generateImage(config, {
				prompt,
				width,
				height,
				seed,
				guidanceScale: guidance_scale,
				numInferenceSteps: num_inference_steps,
				negativePrompt: negative_prompt,
				model,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Image generated successfully.",
							`image_url: ${result.imageUrl}`,
							`mime_type: ${result.mimeType}`,
							`model: ${result.model}`,
							`width: ${result.width}`,
							`height: ${result.height}`,
							"",
							"To render an inline image in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					image_url: result.imageUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					model: result.model,
					file_name: result.fileName,
					prompt: result.prompt,
					width: result.width,
					height: result.height,
					seed: result.seed,
				},
			};
		}
	);

	server.registerTool(
		"image_to_image",
		{
			description:
				"Transform an existing image based on a new text prompt. Use this for style transfer, creating variations of an image, or reimagining an image with different characteristics. Provide a public URL to the source image. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an inline image.",
			inputSchema: {
				image_url: z
					.string()
					.url()
					.describe("Public URL to the source image to transform."),
				prompt: z
					.string()
					.min(8)
					.max(2000)
					.describe(
						"Detailed prompt describing how to transform the source image."
					),
				strength: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe(
						"How much to deviate from the source image. 0.0 = almost unchanged, 1.0 = completely new image. Default depends on the model."
					),
				seed: z
					.number()
					.int()
					.min(0)
					.max(2_147_483_647)
					.optional()
					.describe("Optional deterministic seed for reproducibility."),
				guidance_scale: z
					.number()
					.min(0)
					.max(20)
					.optional()
					.describe("Guidance scale. Higher values make the output more closely match the prompt."),
				num_inference_steps: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe("Number of denoising steps. More steps improve quality but increase latency."),
				model: z
					.string()
					.min(3)
					.optional()
					.describe(
						"Optional Hugging Face model ID override. Leave unset to use the server default img2img model."
					),
			},
			outputSchema: {
				image_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				model: z.string(),
				file_name: z.string(),
				prompt: z.string(),
				seed: z.number().int().optional(),
			},
		},
		async ({ image_url, prompt, strength, seed, guidance_scale, num_inference_steps, model }) => {
			const result = await imageToImage(config, {
				imageUrl: image_url,
				prompt,
				strength,
				seed,
				guidanceScale: guidance_scale,
				numInferenceSteps: num_inference_steps,
				model,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Image transformed successfully.",
							`image_url: ${result.imageUrl}`,
							`mime_type: ${result.mimeType}`,
							`model: ${result.model}`,
							"",
							"To render an inline image in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					image_url: result.imageUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					model: result.model,
					file_name: result.fileName,
					prompt: result.prompt,
					seed: result.seed,
				},
			};
		}
	);

	server.registerTool(
		"edit_image",
		{
			description:
				"Edit an existing image using instruction-based editing. Use this when the user wants precise modifications like 'make it sunny', 'add a hat', 'remove the background', or 'change the color to red'. Provide a public URL to the source image. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an inline image.",
			inputSchema: {
				image_url: z
					.string()
					.url()
					.describe("Public URL to the source image to edit."),
				prompt: z
					.string()
					.min(8)
					.max(2000)
					.describe(
						"Clear instruction describing the desired edit, e.g. 'make the sky blue' or 'add sunglasses to the person'."
					),
				seed: z
					.number()
					.int()
					.min(0)
					.max(2_147_483_647)
					.optional()
					.describe("Optional deterministic seed for reproducibility."),
				guidance_scale: z
					.number()
					.min(0)
					.max(20)
					.optional()
					.describe("Guidance scale. Higher values make the edit more closely follow the instruction."),
				num_inference_steps: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe("Number of denoising steps. More steps improve quality but increase latency."),
				model: z
					.string()
					.min(3)
					.optional()
					.describe(
						"Optional Hugging Face model ID override. Leave unset to use the server default edit model."
					),
			},
			outputSchema: {
				image_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				model: z.string(),
				file_name: z.string(),
				prompt: z.string(),
				seed: z.number().int().optional(),
			},
		},
		async ({ image_url, prompt, seed, guidance_scale, num_inference_steps, model }) => {
			const result = await editImage(config, {
				imageUrl: image_url,
				prompt,
				seed,
				guidanceScale: guidance_scale,
				numInferenceSteps: num_inference_steps,
				model,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Image edited successfully.",
							`image_url: ${result.imageUrl}`,
							`mime_type: ${result.mimeType}`,
							`model: ${result.model}`,
							"",
							"To render an inline image in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					image_url: result.imageUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					model: result.model,
					file_name: result.fileName,
					prompt: result.prompt,
					seed: result.seed,
				},
			};
		}
	);

	return server;
}

async function main() {
	await mkdir(config.storageDir, { recursive: true });

	const app = express();
	app.use(express.json());
	app.use("/media", express.static(config.storageDir, { fallthrough: false, index: false, maxAge: "1h" }));

	app.get("/", (_req: Request, res: Response) => {
		res.json({
			name: "image-gen-mcp",
			mcpPath: "/mcp",
			healthcheck: "/healthcheck",
			defaultModel: config.defaultModelId,
			img2imgModel: config.img2imgModelId,
			editModel: config.editModelId,
		});
	});

	app.get("/healthcheck", (_req: Request, res: Response) => {
		res.json({
			ok: true,
			service: "image-gen-mcp",
			defaultModel: config.defaultModelId,
			img2imgModel: config.img2imgModelId,
			editModel: config.editModelId,
			publicBaseUrl: config.publicBaseUrl,
			allowedHosts: config.allowedHosts,
			storageDir: config.storageDir,
		});
	});

	app.post("/mcp", async (req: Request, res: Response) => {
		const server = createServer();

		try {
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
			});

			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);

			res.on("close", () => {
				void transport.close();
				void server.close();
			});
		} catch (error) {
			console.error("Error handling MCP request:", error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message:
							error instanceof Error ? error.message : "Internal server error",
					},
					id: null,
				});
			}
		}
	});

	app.get("/mcp", (_req: Request, res: Response) => {
		res
			.status(405)
			.set("Allow", "POST")
			.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
	});

	app.delete("/mcp", (_req: Request, res: Response) => {
		res
			.status(405)
			.set("Allow", "POST")
			.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
	});

	app.listen(config.port, "0.0.0.0", () => {
		console.log(`image-gen-mcp listening on port ${config.port}`);
		console.log(`MCP endpoint: ${config.publicBaseUrl}/mcp`);
	});
}

main().catch((error) => {
	console.error("Failed to start image-gen-mcp:", error);
	process.exit(1);
});
