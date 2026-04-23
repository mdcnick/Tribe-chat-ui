import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

export type AuthProvider = "clerk" | "legacy-oidc" | "trusted-header";

export interface User extends Timestamps {
	_id: ObjectId;

	username?: string;
	name: string;
	email?: string;
	avatarUrl: string | undefined;
	authProvider: AuthProvider;
	authSubject: string;
	hfUserId?: string;
	isAdmin?: boolean;
	isEarlyAccess?: boolean;
}
