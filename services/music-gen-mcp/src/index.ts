import express, { type Request, type Response } from "express";
import { mkdir } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import * as z from "zod/v4";

import { loadConfig } from "./config.js";
import { SONG_GENRES, generateMusic, generateLyriaMusic, generateSong } from "./music.js";
import { MusicGenerationMode } from "@google/genai";

const config = loadConfig();

function createServer() {
	const server = new McpServer(
		{
			name: "music-gen-mcp",
			version: "0.1.0",
		},
		{ capabilities: { logging: {} } }
	);

	server.registerTool(
		"generate_music",
		{
			description:
				"Generate a short music clip from a text prompt using a Hugging Face music model. Use this when the user wants background music, ambience, a jingle, soundtrack, or instrumental texture. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an audio player. Do not use it for speech transcription or factual lookup tasks.",
			inputSchema: {
				prompt: z
					.string()
					.min(8)
					.max(600)
					.describe(
						"Detailed music prompt, including mood, genre, tempo, instruments, and texture."
					),
				duration_seconds: z
					.number()
					.int()
					.min(1)
					.max(60)
					.optional()
					.describe(
						"Optional target duration in seconds. Some models may ignore or approximate it."
					),
				seed: z
					.number()
					.int()
					.min(0)
					.max(2_147_483_647)
					.optional()
					.describe("Optional deterministic seed if the selected model supports it."),
				model: z
					.string()
					.min(3)
					.optional()
					.describe(
						"Optional Hugging Face model ID override. Leave unset to use the server default model."
					),
			},
			outputSchema: {
				audio_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				model: z.string(),
				file_name: z.string(),
				prompt: z.string(),
				duration_seconds: z.number().int().optional(),
				seed: z.number().int().optional(),
			},
		},
		async ({ prompt, duration_seconds, seed, model }) => {
			const result = await generateMusic(config, {
				prompt,
				durationSeconds: duration_seconds,
				seed,
				model,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Music generated successfully.",
							`audio_url: ${result.audioUrl}`,
							`mime_type: ${result.mimeType}`,
							`model: ${result.model}`,
							"",
							"To render an inline audio player in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					audio_url: result.audioUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					model: result.model,
					file_name: result.fileName,
					prompt: result.prompt,
					duration_seconds: result.durationSeconds,
					seed: result.seed,
				},
			};
		}
	);

	server.registerTool(
		"generate_lyria_music",
		{
			description:
				"Generate high-quality music from a text prompt using Google's Lyria model. Use this when the user wants background music, ambience, a jingle, soundtrack, or instrumental texture with fine-grained control over musical properties. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an audio player.",
			inputSchema: {
				prompt: z
					.string()
					.min(8)
					.max(600)
					.describe(
						"Detailed music prompt, including mood, genre, tempo, instruments, and texture."
					),
				duration_seconds: z
					.number()
					.int()
					.min(1)
					.max(120)
					.optional()
					.describe("Optional target duration in seconds. Lyria supports up to 120 seconds."),
				seed: z
					.number()
					.int()
					.min(0)
					.max(2_147_483_647)
					.optional()
					.describe("Optional deterministic seed for reproducible results."),
				model: z
					.enum(["lyria-3-clip-preview", "lyria-3-pro-preview"])
					.optional()
					.describe("Optional Lyria model override. Default is lyria-3-pro-preview."),
				temperature: z
					.number()
					.min(0)
					.max(3)
					.optional()
					.describe(
						"Controls variance in audio generation. Range [0.0, 3.0]. Higher values produce higher variance."
					),
				top_k: z
					.number()
					.int()
					.min(1)
					.max(1000)
					.optional()
					.describe(
						"Top-K sampling. Samples the topK tokens with highest probabilities. Range [1, 1000]."
					),
				guidance: z
					.number()
					.min(0)
					.max(6)
					.optional()
					.describe(
						"Controls how closely the model follows prompts. Higher guidance follows more closely but makes transitions more abrupt. Range [0.0, 6.0]."
					),
				bpm: z
					.number()
					.int()
					.min(60)
					.max(200)
					.optional()
					.describe("Beats per minute. Range [60, 200]."),
				density: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe("Density of sounds. Range [0.0, 1.0]."),
				brightness: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe("Brightness of the music. Range [0.0, 1.0]."),
				mute_bass: z
					.boolean()
					.optional()
					.describe("Whether the audio output should not contain bass."),
				mute_drums: z
					.boolean()
					.optional()
					.describe("Whether the audio output should not contain drums."),
				only_bass_and_drums: z
					.boolean()
					.optional()
					.describe("Whether the audio output should contain only bass and drums."),
				music_generation_mode: z
					.enum(["QUALITY", "DIVERSITY", "VOCALIZATION"])
					.optional()
					.describe(
						"Generation mode: QUALITY for higher quality, DIVERSITY for more variety, VOCALIZATION for music with vocals."
					),
			},
			outputSchema: {
				audio_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				model: z.string(),
				file_name: z.string(),
				prompt: z.string(),
				duration_seconds: z.number().int().optional(),
				seed: z.number().int().optional(),
			},
		},
		async ({
			prompt,
			duration_seconds,
			seed,
			model,
			temperature,
			top_k,
			guidance,
			bpm,
			density,
			brightness,
			mute_bass,
			mute_drums,
			only_bass_and_drums,
			music_generation_mode,
		}) => {
			const result = await generateLyriaMusic(config, {
				prompt,
				durationSeconds: duration_seconds,
				seed,
				model,
				temperature,
				topK: top_k,
				guidance,
				bpm,
				density,
				brightness,
				muteBass: mute_bass,
				muteDrums: mute_drums,
				onlyBassAndDrums: only_bass_and_drums,
				musicGenerationMode: music_generation_mode
					? (MusicGenerationMode as Record<string, MusicGenerationMode>)[music_generation_mode]
					: undefined,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Music generated successfully using Lyria.",
							`audio_url: ${result.audioUrl}`,
							`mime_type: ${result.mimeType}`,
							`model: ${result.model}`,
							"",
							"To render an inline audio player in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					audio_url: result.audioUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					model: result.model,
					file_name: result.fileName,
					prompt: result.prompt,
					duration_seconds: result.durationSeconds,
					seed: result.seed,
				},
			};
		}
	);

	server.registerTool(
		"generate_song",
		{
			description:
				"Generate a full song using Tencent SongGeneration's structured song format. Use this when the user wants sung lyrics, verse/chorus structure, genre steering, or an audio-prompted song continuation. Lyrics must be formatted in tagged sections like [verse], [chorus], [bridge], [intro-medium], or [outro-medium]. After calling this tool, include the returned chat_ui_markdown in the final answer so Chat UI renders an audio player.",
			inputSchema: {
				lyrics: z
					.string()
					.min(8)
					.max(8000)
					.describe(
						"Structured lyrics in SongGeneration format. Separate sections by blank lines and start each section with a tag such as [verse], [chorus], [bridge], [intro-medium], [inst-short], or [outro-medium]."
					),
				text_prompt: z
					.string()
					.max(500)
					.optional()
					.describe(
						"Optional song description. The live Space describes this as guidance for gender, genre, emotion, and instruments."
					),
				audio_prompt_url: z
					.string()
					.url()
					.optional()
					.describe(
						"Optional public URL to an audio prompt file. When provided, the Space uses it as the prompt audio input."
					),
				genre: z
					.enum(SONG_GENRES)
					.optional()
					.describe("Optional genre preset matching the Space's current genre selector."),
				cfg_coefficient: z
					.number()
					.min(0.1)
					.max(3)
					.optional()
					.describe("Optional CFG coefficient. The live Space default is 1.8."),
				temperature: z
					.number()
					.min(0.1)
					.max(2)
					.optional()
					.describe("Optional sampling temperature. The live Space default is 0.8."),
			},
			outputSchema: {
				audio_url: z.string().url(),
				chat_ui_markdown: z.string(),
				mime_type: z.string(),
				file_name: z.string(),
				lyrics: z.string(),
				text_prompt: z.string().optional(),
				audio_prompt_url: z.string().url().optional(),
				genre: z.enum(SONG_GENRES),
				cfg_coefficient: z.number(),
				temperature: z.number(),
				space_id: z.string(),
				generated_info: z.unknown().optional(),
			},
		},
		async ({ lyrics, text_prompt, audio_prompt_url, genre, cfg_coefficient, temperature }) => {
			const result = await generateSong(config, {
				lyrics,
				textPrompt: text_prompt,
				audioPromptUrl: audio_prompt_url,
				genre,
				cfgCoefficient: cfg_coefficient,
				temperature,
			});

			return {
				content: [
					{
						type: "text",
						text: [
							"Song generated successfully.",
							`audio_url: ${result.audioUrl}`,
							`mime_type: ${result.mimeType}`,
							`space_id: ${result.spaceId}`,
							`genre: ${result.genre}`,
							"",
							"To render an inline audio player in Chat UI, include this markdown exactly:",
							result.chatUiMarkdown,
						].join("\n"),
					},
				],
				structuredContent: {
					audio_url: result.audioUrl,
					chat_ui_markdown: result.chatUiMarkdown,
					mime_type: result.mimeType,
					file_name: result.fileName,
					lyrics: result.lyrics,
					text_prompt: result.textPrompt,
					audio_prompt_url: result.audioPromptUrl,
					genre: result.genre,
					cfg_coefficient: result.cfgCoefficient,
					temperature: result.temperature,
					space_id: result.spaceId,
					generated_info: result.generatedInfo,
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
	app.use(
		"/media",
		express.static(config.storageDir, { fallthrough: false, index: false, maxAge: "1h" })
	);

	app.get("/", (_req: Request, res: Response) => {
		res.json({
			name: "music-gen-mcp",
			mcpPath: "/mcp",
			healthcheck: "/healthcheck",
			defaultModel: config.defaultModelId,
			songGenerationSpaceId: config.songGenerationSpaceId,
		});
	});

	app.get("/healthcheck", (_req: Request, res: Response) => {
		res.json({
			ok: true,
			service: "music-gen-mcp",
			defaultModel: config.defaultModelId,
			songGenerationSpaceId: config.songGenerationSpaceId,
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
						message: error instanceof Error ? error.message : "Internal server error",
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
		console.log(`music-gen-mcp listening on port ${config.port}`);
		console.log(`MCP endpoint: ${config.publicBaseUrl}/mcp`);
	});
}

main().catch((error) => {
	console.error("Failed to start music-gen-mcp:", error);
	process.exit(1);
});
