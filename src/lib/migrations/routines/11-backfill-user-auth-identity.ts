import { ObjectId } from "mongodb";
import { collections } from "$lib/server/database";
import type { Migration } from ".";

const migration: Migration = {
	_id: new ObjectId("000000000000000000000011"),
	name: "Backfill user auth provider and subject fields",
	up: async () => {
		await collections.users.updateMany(
			{
				hfUserId: { $exists: true },
				$or: [{ authProvider: { $exists: false } }, { authSubject: { $exists: false } }],
			},
			[
				{
					$set: {
						authProvider: "legacy-oidc",
						authSubject: "$hfUserId",
					},
				},
			]
		);

		try {
			await collections.users.dropIndex("hfUserId_1");
		} catch {
			// Index may not exist yet.
		}

		await collections.users.createIndex({ hfUserId: 1 }, { unique: true, sparse: true });
		await collections.users.createIndex(
			{ authProvider: 1, authSubject: 1 },
			{
				unique: true,
				partialFilterExpression: {
					authProvider: { $exists: true },
					authSubject: { $exists: true },
				},
			}
		);

		return true;
	},
};

export default migration;
