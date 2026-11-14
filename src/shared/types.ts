/**
 * Types shared between the Hono server and the Inertia Svelte client.
 * Keep this file free of runtime imports — it must be importable from
 * both `src/server` (Bun runtime) and `src/client` (browser bundle).
 */

export type Role = "user" | "admin";

export interface User {
	id: string;
	name: string;
	email: string;
	role: Role;
	/** Relative path to the avatar image (served from /uploads), null when unset. */
	avatarUrl: string | null;
	/** Whether the user has verified their email address. */
	emailVerified: boolean;
	createdAt: string;
}

/** One-shot session flash messages, persisted in the `sessions` table. */
export interface FlashData {
	success?: string;
	error?: string;
	/** Validation errors for the redirect-back (non-Inertia) flow. */
	errors?: Record<string, string>;
}

/** Props the server merges into every Inertia page response. */
export interface SharedPageProps {
	[key: string]: unknown;
	auth: { user: User | null };
	errors: Record<string, string>;
}

/** A personal API token as exposed to the dashboard (never the raw value
 *  or its hash — the raw token is returned only once at creation). */
export interface ApiToken {
	id: string;
	name: string;
	/** First 12 chars of the token, e.g. `dlk_a1b2c3d4` — for recognition. */
	tokenPrefix: string;
	expiresAt: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
}

/** Generic pagination envelope, mirroring what the server returns. */
export interface Paginated<T> {
	data: T[];
	meta: {
		currentPage: number;
		perPage: number;
		lastPage: number;
		total: number;
	};
}

/** Visit Flow: business segment for an entity/activity. */
export type Segment = "B2G" | "B2B";

/** Visit Flow: lifecycle status of a visit activity. */
export type VisitStatus = "NOT_VISITED" | "VISITED";

/** Visit Flow: a visit-target entity (master data, e.g. an office or company). */
export interface Entity {
	id: string;
	name: string;
	/** Distinguishes entities with a similar name, e.g. "Instansi", "Perusahaan". */
	type: string;
	segment: Segment;
	region: string;
	createdAt: string;
}

/** Visit Flow: a visit plan/record against an entity. */
export interface Activity {
	id: string;
	entityId: string;
	entityName: string;
	entityType: string;
	segment: Segment;
	region: string;
	visitDate: string;
	status: VisitStatus;
	/** Point-plus requirement: the sales person who made/owns the visit. */
	salesName: string;
	createdAt: string;
	updatedAt: string;
}
