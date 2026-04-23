import { assert, it, describe, afterEach, vi, expect } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import { defaultModel } from "$lib/server/models";
import { findUser } from "$lib/server/auth";
import { syncAuthenticatedUser } from "$lib/server/syncAuthenticatedUser";

const profile = {
	authProvider: "clerk" as const,
	authSubject: "user_1234567890",
	username: "new-username",
	name: "name",
	email: "name@example.com",
	avatarUrl: "https://example.com/avatar.png",
};
Object.freeze(profile);

const locals: App.Locals = {
	sessionId: "1234567890",
	isAdmin: false,
};

const cookiesMock = {
	set: vi.fn(),
	get: vi.fn(),
} as unknown as Cookies;

const insertRandomUser = async () => {
	const res = await collections.users.insertOne({
		_id: new ObjectId(),
		createdAt: new Date(),
		updatedAt: new Date(),
		username: "base-username",
		name: profile.name,
		email: profile.email,
		avatarUrl: profile.avatarUrl,
		authProvider: profile.authProvider,
		authSubject: profile.authSubject,
	});

	return res.insertedId;
};

const insertRandomConversations = async (count: number) => {
	const res = await collections.conversations.insertMany(
		new Array(count).fill(0).map(() => ({
			_id: new ObjectId(),
			title: "random title",
			messages: [],
			model: defaultModel.id,
			createdAt: new Date(),
			updatedAt: new Date(),
			sessionId: locals.sessionId,
		}))
	);

	return res.insertedIds;
};

describe("authenticated user sync", () => {
	it("should update user if existing", async () => {
		await insertRandomUser();

		await syncAuthenticatedUser({
			...profile,
			locals,
			cookies: cookiesMock,
			currentSessionId: locals.sessionId,
			currentSecretSessionId: locals.sessionId,
		});

		const existingUser = await collections.users.findOne({
			authProvider: profile.authProvider,
			authSubject: profile.authSubject,
		});

		assert.equal(existingUser?.name, profile.name);
		expect(cookiesMock.set).toBeCalledTimes(1);
	}, 30000);

	it("should migrate pre-existing conversations for new user", async () => {
		const insertedId = await insertRandomUser();

		await insertRandomConversations(2);

		await syncAuthenticatedUser({
			...profile,
			locals,
			cookies: cookiesMock,
			currentSessionId: locals.sessionId,
			currentSecretSessionId: locals.sessionId,
		});

		const conversationCount = await collections.conversations.countDocuments({
			userId: insertedId,
			sessionId: { $exists: false },
		});

		assert.equal(conversationCount, 2);

		await collections.conversations.deleteMany({ userId: insertedId });
	});

	it("should create default settings for new user", async () => {
		await syncAuthenticatedUser({
			...profile,
			locals,
			cookies: cookiesMock,
			currentSessionId: locals.sessionId,
			currentSecretSessionId: locals.sessionId,
		});

		const user = (await findUser(locals.sessionId, undefined)).user;

		assert.exists(user);

		const settings = await collections.settings.findOne({ userId: user?._id });

		expect(settings).toMatchObject({
			userId: user?._id,
			updatedAt: expect.any(Date),
			createdAt: expect.any(Date),
			...DEFAULT_SETTINGS,
		});

		await collections.settings.deleteOne({ userId: user?._id });
	});

	it("should migrate pre-existing settings for pre-existing user", async () => {
		const { insertedId } = await collections.settings.insertOne({
			sessionId: locals.sessionId,
			updatedAt: new Date(),
			createdAt: new Date(),
			...DEFAULT_SETTINGS,
			shareConversationsWithModelAuthors: false,
		});

		await syncAuthenticatedUser({
			...profile,
			locals,
			cookies: cookiesMock,
			currentSessionId: locals.sessionId,
			currentSecretSessionId: locals.sessionId,
		});

		const settings = await collections.settings.findOne({
			_id: insertedId,
			sessionId: { $exists: false },
		});

		assert.exists(settings);

		const user = await collections.users.findOne({
			authProvider: profile.authProvider,
			authSubject: profile.authSubject,
		});

		expect(settings).toMatchObject({
			userId: user?._id,
			updatedAt: expect.any(Date),
			createdAt: expect.any(Date),
			...DEFAULT_SETTINGS,
			shareConversationsWithModelAuthors: false,
		});

		await collections.settings.deleteOne({ userId: user?._id });
	});
});

afterEach(async () => {
	await collections.users.deleteMany({ authSubject: profile.authSubject });
	await collections.sessions.deleteMany({});

	locals.sessionId = "1234567890";
	vi.clearAllMocks();
});
