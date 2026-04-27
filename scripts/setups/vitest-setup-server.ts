import { vi, afterAll } from "vitest";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";

// Load the .env file
const envPath = resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

// Parse the .env content
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = dotenv.parse(envContent);

// Separate public and private variables
const publicEnv: Record<string, string> = {};
const privateEnv: Record<string, string> = {};

for (const [key, value] of Object.entries(envVars)) {
	if (key.startsWith("PUBLIC_")) {
		publicEnv[key] = value;
	} else {
		privateEnv[key] = value;
	}
}

// Store the mongo server reference for cleanup
let mongoServer: import("mongodb-memory-server").MongoMemoryServer | null = null;

// We need to set up the mock in a way that doesn't get hoisted prematurely
// Use a factory function that vitest will call at the right time
vi.mock("$env/dynamic/public", () => ({
	env: publicEnv,
}));

// For private env, we need to create the mongo server lazily
// to avoid port conflicts and hoisting issues
let privateEnvWithMongo: Record<string, string> = { ...privateEnv };

vi.mock("$env/dynamic/private", async () => {
	// Only create mongo server once
	if (!mongoServer) {
		const { MongoMemoryServer } = await import("mongodb-memory-server");
		mongoServer = await MongoMemoryServer.create();
		privateEnvWithMongo = {
			...privateEnv,
			MONGODB_URL: mongoServer.getUri(),
		};
	}

	return {
		env: privateEnvWithMongo,
	};
});

afterAll(async () => {
	if (mongoServer) {
		await mongoServer.stop();
	}
});
