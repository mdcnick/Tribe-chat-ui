import type { ObjectId } from "mongodb";

import type { Database } from "$lib/server/database";
import migration01 from "./01-update-search-assistants";
import migration02 from "./02-update-assistants-models";
import migration04 from "./04-update-message-updates";
import migration05 from "./05-update-message-files";
import migration06 from "./06-trim-message-updates";
import migration08 from "./08-update-featured-to-review";
import migration09 from "./09-delete-empty-conversations";
import migration10 from "./10-update-reports-assistantid";
import migration11 from "./11-backfill-user-auth-identity";

export interface Migration {
	_id: ObjectId;
	name: string;
	up: (client: Database) => Promise<boolean>;
	down?: (client: Database) => Promise<boolean>;
	runForFreshInstall?: "only" | "never"; // leave unspecified to run for both
	runForHuggingChat?: "only" | "never"; // leave unspecified to run for both
	runEveryTime?: boolean;
}

export const migrations: Migration[] = [
	migration01,
	migration02,
	migration04,
	migration05,
	migration06,
	migration08,
	migration09,
	migration10,
	migration11,
];
