import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

import {
	cleanupTestData,
	createTestConversation,
	createTestLocals,
	createTestUser,
} from "$lib/server/api/__tests__/testHelpers";

const { releaseMock } = vi.hoisted(() => ({
	releaseMock: vi.fn<(conversationId: string, reason?: string) => Promise<boolean>>(),
}));

vi.mock("$lib/server/browser/sessionStore", () => ({
	browserSessionStore: {
		release: releaseMock,
	},
}));

import { POST } from "../../../routes/conversation/[id]/browser/+server";

describe.sequential("POST /conversation/[id]/browser", () => {
	afterEach(async () => {
		releaseMock.mockReset();
		vi.restoreAllMocks();
		await cleanupTestData();
	});

	it("returns 200 and releases the stored browser session on manual close", async () => {
		const { locals } = await createTestUser();
		const conversation = await createTestConversation(locals);
		releaseMock.mockResolvedValue(true);

		const response = await POST({
			params: { id: conversation._id.toString() },
			locals,
		} as never);

		expect(response.status).toBe(200);
		expect(releaseMock).toHaveBeenCalledTimes(1);
		expect(releaseMock).toHaveBeenCalledWith(conversation._id.toString(), "manual-close");
	});

	it("keeps close best-effort when release fails", async () => {
		const { locals } = await createTestUser();
		const conversation = await createTestConversation(locals);
		releaseMock.mockRejectedValue(new Error("steel unavailable"));

		const response = await POST({
			params: { id: conversation._id.toString() },
			locals,
		} as never);

		expect(response.status).toBe(200);
		expect(releaseMock).toHaveBeenCalledWith(conversation._id.toString(), "manual-close");
	});

	it("throws 404 when conversation is not found", async () => {
		const { locals } = await createTestUser();
		const missingId = new ObjectId().toString();

		try {
			await POST({
				params: { id: missingId },
				locals,
			} as never);
			expect.fail("Expected 404 error");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});

	it("throws 401 for unauthenticated requests", async () => {
		const locals = createTestLocals({ user: undefined, sessionId: undefined });

		try {
			await POST({
				params: { id: new ObjectId().toString() },
				locals,
			} as never);
			expect.fail("Expected 401 error");
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(401);
		}
	});
});
