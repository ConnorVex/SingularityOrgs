// Reading groups from the database (the orgs_* functions in supabase/migrations/20261116100000_orgs.sql).
// On the dev server, ?demo in the address bar swaps in sample data (src/lib/demo.ts) for layout checks.
import { supabase } from './supabase.ts';
import { ECONOMY } from './links.ts';

export type Kind = 'organization' | 'corporation' | 'agency';
export type GroupStatus = 'pending' | 'approved' | 'needs_correction' | 'denied';

export const KINDS: { id: Kind; label: string; plural: string }[] = [
	{ id: 'organization', label: 'Organization', plural: 'Organizations' },
	{ id: 'corporation', label: 'Corporation', plural: 'Corporations' },
	{ id: 'agency', label: 'Hero Agency', plural: 'Hero Agencies' },
];
export const kindLabel = (k: Kind) => KINDS.find((x) => x.id === k)!.label;

export const STATUS_TEXT: Record<GroupStatus, string> = {
	pending: 'Waiting for review',
	approved: 'Approved',
	needs_correction: 'Needs correction',
	denied: 'Denied',
};

export interface GroupCard {
	id: string;
	slug: string;
	kind: Kind;
	name: string;
	tagline: string;
	logo: string | null;
	colour: string;
	recruiting: boolean;
	headquarters: string;
	members: number;
	leader: string | null;
	balance: number | null;
	points: number | null;
}

export interface Rank {
	id: string;
	title: string;
	sort: number;
	leader: boolean;
	manage: boolean;
	spend: boolean;
	edit: boolean;
}

export interface Member {
	id: string;
	character: string;
	name: string;
	image: string | null;
	player: string;
	rank: string;
	joined_at: string | null;
	mine: boolean;
}

export interface JoinRequest {
	id: string;
	character: string;
	name: string;
	image: string | null;
	player: string;
	message: string;
	created_at: string;
	mine: boolean;
}

export interface WalletEntry {
	id: string;
	kind: string;
	memo: string;
	at: string;
	amount: number;
	other: string | null;
}

export interface Duty {
	id: string;
	character: string;
	tier: string;
	summary: string;
	link: string;
	status: 'pending' | 'approved' | 'denied';
	points: number;
	review_note: string | null;
	mine: boolean;
	at: string;
}

export interface Group {
	id: string;
	slug: string;
	kind: Kind;
	name: string;
	status: GroupStatus;
	tagline: string;
	about: string;
	logo_url: string;
	banner_url: string;
	colour: string;
	headquarters: string;
	discord_url: string;
	recruiting: boolean;
	approved_at: string | null;
	created_at: string;
	review_note: string | null;
	is_requester: boolean;
	me: { leader: boolean; manage: boolean; spend: boolean; edit: boolean; member: boolean; admin: boolean };
	ranks: Rank[];
	members: Member[];
	requests: JoinRequest[];
	wallet: { account: string; balance: number; symbol: string; history: WalletEntry[] } | null;
	shops: { id: string; name: string; description: string; image: string | null; status: string; items: number }[];
	points: number | null;
	duties: Duty[] | null;
}

const root = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const demoMode = () => import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
// Links keep ?demo while browsing sample data.
const query = (params: Record<string, string>) => {
	const q = new URLSearchParams(params);
	if (demoMode()) q.set('demo', '');
	const text = q.toString().replace(/=$|=(?=&)/g, '');
	return text ? `?${text}` : '';
};

export const groupsHref = (kind?: Kind) => `${root}groups/${query(kind ? { type: kind } : {})}`;
export const groupHref = (slug: string) => `${root}groups/view/${query({ g: slug })}`;
export const newGroupHref = (edit?: string) => `${root}groups/new/${query(edit ? { edit } : {})}`;
export const requestHref = (kind: Kind) => `${root}groups/new/${query({ type: kind })}`;
export const rankingHref = () => `${root}ranking/${query({})}`;
export const mineHref = () => `${root}mine/${query({})}`;
export const shopHref = (id: string) => `${ECONOMY}#/shops/${id}`;

function client() {
	if (!supabase) throw new Error('The site is not connected to its database yet.');
	return supabase;
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
	const { data, error } = await client().rpc(fn, args);
	if (error) throw error;
	return data as T;
}

export async function loadDirectory(): Promise<GroupCard[]> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).DEMO_CARDS;
	return call<GroupCard[]>('orgs_directory', { p_kind: null, p_search: null });
}

/** Null when the group doesn't exist or the visitor can't see it yet. */
export async function loadGroup(slug: string): Promise<Group | null> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).demoGroup(slug);
	return call<Group | null>('orgs_group', { p_slug: slug });
}

export interface Mine {
	characters: { id: string; name: string }[];
	memberships: {
		id: string;
		status: 'requested' | 'active';
		character: string;
		character_id: string;
		group: string;
		slug: string;
		kind: Kind;
		logo: string | null;
		rank: string;
		leader: boolean;
	}[];
	requested: { id: string; name: string; slug: string; kind: Kind; status: GroupStatus; review_note: string }[];
}

export interface Tier {
	id: string;
	name: string;
	points: number;
	description: string;
	sort: number;
	retired: boolean;
}

/** Profile fields a player sets when requesting or editing a group. */
export interface GroupFields {
	name: string;
	tagline: string;
	about: string;
	logo_url: string;
	banner_url: string;
	colour: string;
	headquarters: string;
	discord_url: string;
	recruiting: boolean;
}

export async function loadMine(): Promise<Mine> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).DEMO_MINE;
	return call<Mine>('orgs_mine');
}

export async function loadTiers(): Promise<Tier[]> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).DEMO_TIERS;
	return call<Tier[]>('orgs_tiers');
}

// Actions. On the dev server's sample data they do nothing, so buttons can be clicked safely.
async function act<T>(fn: string, args: Record<string, unknown>): Promise<T> {
	if (import.meta.env.DEV && demoMode()) {
		console.info('[demo] skipped', fn, args);
		return null as T;
	}
	return call<T>(fn, args);
}

export const requestGroup = (kind: Kind, leader: string, fields: GroupFields) =>
	act<string>('orgs_request', { p_kind: kind, p_leader: leader, p_fields: fields });
export const updateGroup = (group: string, fields: Partial<GroupFields>) => act<void>('orgs_update', { p_group: group, p_fields: fields });
export const resubmitGroup = (group: string) => act<void>('orgs_resubmit', { p_group: group });
export const deleteGroup = (group: string) => act<void>('orgs_delete', { p_group: group });
export const askToJoin = (group: string, character: string, message: string) =>
	act<string>('orgs_ask_join', { p_group: group, p_character: character, p_message: message });
export const respondJoin = (member: string, accept: boolean, rank: string | null = null) =>
	act<void>('orgs_respond_join', { p_member: member, p_accept: accept, p_rank: rank });
export const setRank = (member: string, rank: string) => act<void>('orgs_set_rank', { p_member: member, p_rank: rank });
export const removeMember = (member: string) => act<void>('orgs_remove_member', { p_member: member });
export const transferLeader = (group: string, member: string) => act<void>('orgs_transfer_leader', { p_group: group, p_member: member });
export const saveRank = (group: string, rank: Partial<Rank> & { title: string; sort: number }) =>
	act<string>('orgs_save_rank', {
		p_group: group,
		p_rank: rank.id ?? null,
		p_title: rank.title,
		p_sort: rank.sort,
		p_manage: rank.manage ?? false,
		p_spend: rank.spend ?? false,
		p_edit: rank.edit ?? false,
	});
export const deleteRank = (rank: string) => act<void>('orgs_delete_rank', { p_rank: rank });
export const logDuty = (group: string, character: string, tier: string, summary: string, details: string, link: string) =>
	act<string>('orgs_log_duty', { p_group: group, p_character: character, p_tier: tier, p_summary: summary, p_details: details, p_link: link });
export const withdrawDuty = (duty: string) => act<void>('orgs_withdraw_duty', { p_duty: duty });

export interface RankedAgency {
	position: number;
	id: string;
	slug: string;
	name: string;
	tagline: string;
	logo: string | null;
	colour: string;
	points: number;
	pinned: boolean;
	pin_note: string | null;
	members: number;
	duties: number;
}

export interface AdminQueue {
	groups: {
		id: string;
		slug: string;
		kind: Kind;
		name: string;
		tagline: string;
		about: string;
		logo_url: string;
		banner_url: string;
		headquarters: string;
		submitted_at: string;
		requester: string | null;
		leader: string | null;
	}[];
	duties: {
		id: string;
		group: string;
		slug: string;
		character: string;
		player: string | null;
		tier: string;
		points: number;
		summary: string;
		details: string;
		link: string;
		at: string;
	}[];
}

export async function loadRanking(): Promise<RankedAgency[]> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).DEMO_RANKING;
	return call<RankedAgency[]>('orgs_ranking');
}

export async function loadAdminQueue(): Promise<AdminQueue> {
	if (import.meta.env.DEV && demoMode()) return (await import('./demo.ts')).DEMO_QUEUE;
	return call<AdminQueue>('orgs_admin_queue');
}

export const reviewGroup = (group: string, outcome: 'approved' | 'needs_correction' | 'denied', note: string) =>
	act<void>('orgs_review', { p_group: group, p_outcome: outcome, p_note: note });
export const reviewDuty = (duty: string, approve: boolean, note: string) => act<void>('orgs_review_duty', { p_duty: duty, p_approve: approve, p_note: note });
export const awardPoints = (group: string, points: number, reason: string) => act<void>('orgs_award', { p_group: group, p_points: points, p_reason: reason });
export const pinAgency = (group: string, position: number | null, note: string) => act<void>('orgs_pin', { p_group: group, p_position: position, p_note: note });
export const saveTier = (t: Partial<Tier> & { name: string; points: number }) =>
	act<string>('orgs_save_tier', {
		p_tier: t.id ?? null,
		p_name: t.name,
		p_points: t.points,
		p_description: t.description ?? '',
		p_sort: t.sort ?? 0,
		p_retired: t.retired ?? false,
	});

export const money = (n: number, symbol = '¢') => `${symbol}${n.toLocaleString()}`;
export const messageOf = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e));
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
