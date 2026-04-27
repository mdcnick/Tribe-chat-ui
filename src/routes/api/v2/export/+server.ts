import { error, type RequestHandler } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { authCondition } from "$lib/server/auth";
import { config } from "$lib/server/config";
import yazl from "yazl";
import { downloadFile } from "$lib/server/files/downloadFile";
import mimeTypes from "mime-types";
import { logger } from "$lib/server/logger";

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, "Not logged in");
	}

	if (!locals.isAdmin) {
		error(403, "Not admin");
	}

	if (config.ENABLE_DATA_EXPORT !== "true") {
		error(403, "Data export is not enabled");
	}

	const nExports = await collections.messageEvents.countDocuments({
		userId: locals.user._id,
		type: "export",
		expiresAt: { $gt: new Date() },
	});

	if (nExports >= 1) {
		error(
			429,
			"You have already exported your data recently. Please wait 1 hour before exporting again."
		);
	}

	const stats: {
		nConversations: number;
		nMessages: number;
		nFiles: number;
		nAssistants: number;
		nAvatars: number;
	} = {
		nConversations: 0,
		nMessages: 0,
		nFiles: 0,
		nAssistants: 0,
		nAvatars: 0,
	};

	const zipfile = new yazl.ZipFile();

	const promises = [
		collections.conversations
			.find({ ...authCondition(locals) })
			.toArray()
			.then(async (conversations) => {
				const formattedConversations = await Promise.all(
					conversations.map(async (conversation) => {
						stats.nConversations++;
						const hashes: string[] = [];
						for (const message of conversation.messages) {
							stats.nMessages++;
							if (message.files) {
								for (const file of message.files) {
									hashes.push(file.value);
								}
							}
						}
						const files = await Promise.all(
							hashes.map(async (hash) => {
								try {
									const fileData = await downloadFile(hash, conversation._id);
									return fileData;
								} catch {
									return null;
								}
							})
						);

						const filenames: string[] = [];
						files.forEach((file) => {
							if (!file) return;

							const extension = mimeTypes.extension(file.mime) || null;
							const convId = conversation._id.toString();
							const fileId = file.name.split("-")[1].slice(0, 8);
							const fileName = `file-${convId}-${fileId}` + (extension ? `.${extension}` : "");
							filenames.push(fileName);
							try {
								zipfile.addBuffer(Buffer.from(file.value, "base64"), fileName);
								stats.nFiles++;
							} catch (err) {
								logger.warn({ fileName, err: String(err) }, "Failed to add file to zip");
							}
						});
						return {
							...conversation,
							messages: conversation.messages.map((message) => {
								return {
									...message,
									files: filenames,
									updates: undefined,
								};
							}),
						};
					})
				);

				zipfile.addBuffer(
					Buffer.from(JSON.stringify(formattedConversations, null, 2)),
					"conversations.json"
				);
			}),
		collections.assistants
			.find({ createdById: locals.user._id })
			.toArray()
			.then(async (assistants) => {
				const formattedAssistants = await Promise.all(
					assistants.map(async (assistant) => {
						if (assistant.avatar) {
							const file = await collections.bucket
								.find({ filename: assistant._id.toString() })
								.next();

							if (!file?._id) {
								logger.warn(
									{ assistantId: assistant._id.toString() },
									"Avatar file not found for assistant"
								);
								return;
							}

							const fileStream = collections.bucket.openDownloadStream(file._id);

							const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
								const chunks: Uint8Array[] = [];
								fileStream.on("data", (chunk) => chunks.push(chunk));
								fileStream.on("error", reject);
								fileStream.on("end", () => resolve(Buffer.concat(chunks)));
							});

							if (!fileBuffer) {
								logger.warn(
									{ assistantId: assistant._id.toString() },
									"Avatar file buffer is empty"
								);
								return;
							}

							try {
								zipfile.addBuffer(fileBuffer, `avatar-${assistant._id.toString()}.jpg`);
								stats.nAvatars++;
							} catch (err) {
								logger.warn(
									{ assistantId: assistant._id.toString(), err: String(err) },
									"Failed to add avatar to zip"
								);
							}
						}

						stats.nAssistants++;

						return {
							_id: assistant._id.toString(),
							name: assistant.name,
							createdById: assistant.createdById.toString(),
							createdByName: assistant.createdByName,
							avatar: `avatar-${assistant._id.toString()}.jpg`,
							modelId: assistant.modelId,
							preprompt: assistant.preprompt,
							description: assistant.description,
							dynamicPrompt: assistant.dynamicPrompt,
							exampleInputs: assistant.exampleInputs,
							generateSettings: assistant.generateSettings,
							createdAt: assistant.createdAt.toISOString(),
							updatedAt: assistant.updatedAt.toISOString(),
						};
					})
				);

				zipfile.addBuffer(
					Buffer.from(JSON.stringify(formattedAssistants, null, 2)),
					"assistants.json"
				);
			}),
	];

	await Promise.all(promises);

	logger.info(
		{
			userId: locals.user?._id,
			...stats,
		},
		"Exported user data"
	);
	zipfile.end();
	if (locals.user?._id) {
		await collections.messageEvents.insertOne({
			userId: locals.user._id,
			type: "export",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
		});
	}

	return new Response(zipfile.outputStream as unknown as ReadableStream, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": 'attachment; filename="export.zip"',
		},
	});
};
