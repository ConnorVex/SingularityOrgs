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

export const money = (n: number, symbol = '¢') => `${symbol}${n.toLocaleString()}`;
export const messageOf = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e));
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
