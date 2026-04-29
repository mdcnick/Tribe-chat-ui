import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

export type AuthProvider = "pin" | "better-auth" | "legacy-oidc" | "trusted-header";

export interface User extends Timestamps {
	_id: ObjectId;

	username: string;
	name: string;
	email?: string;
	avatarUrl: string | undefined;
	authProvider: AuthProvider;
	authSubject: string;
	pinHash?: string;
	recoveryPhraseHash?: string; // SHA-256 of the PBKDF2-derived key from the recovery phrase
	hfUserId?: string;
	isAdmin?: boolean;
	isEarlyAccess?: boolean;

	// Encryption wallet for PIN-derived conversation encryption
	encryption?: {
		salt: string; // base64url-encoded random salt
		wrappedKey: string; // KEK-wrapped DEK (base64url)
		wrappedKeyIv: string; // IV used for KEK wrapping (base64url)
	};
}
