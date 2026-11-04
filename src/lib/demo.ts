// Sample groups for checking layouts on the dev server (?demo). Never used on the live site.
import type { AdminQueue, Group, GroupCard, Mine, RankedAgency, Tier } from './orgs.ts';

const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const DEMO_CARDS: GroupCard[] = [
	{ id: '1', slug: 'bright-star-agency', kind: 'agency', name: 'Bright Star Agency', tagline: 'Always there when the city calls. Rescue first, questions later.', logo: null, colour: '#f2b134', recruiting: true, headquarters: 'Musutafu, Japan', members: 6, leader: 'Akari Hoshino', balance: 48200, points: 37 },
	{ id: '2', slug: 'aegis', kind: 'agency', name: 'Aegis', tagline: 'Shield of the eastern ward.', logo: null, colour: '#3b82f6', recruiting: false, headquarters: '', members: 3, leader: 'Rae', balance: 1200, points: 12 },
	{ id: '3', slug: 'kurogane-industries', kind: 'corporation', name: 'Kurogane Industries', tagline: 'Support gear, cyberware and the finest steel money can buy.', logo: null, colour: '#9ca3af', recruiting: true, headquarters: 'Night City', members: 11, leader: 'Daichi Kurogane', balance: 912000, points: null },
	{ id: '4', slug: 'the-crimson-hand', kind: 'organization', name: 'The Crimson Hand', tagline: 'An old order that keeps its secrets.', logo: null, colour: '#ef4444', recruiting: true, headquarters: 'Unknown', members: 4, leader: 'Vesper', balance: 0, points: null },
];

export function demoGroup(slug: string): Group | null {
	const card = DEMO_CARDS.find((c) => c.slug === slug);
	if (!card) return null;
	const agency = card.kind === 'agency';
	return {
		id: card.id,
		slug: card.slug,
		kind: card.kind,
		name: card.name,
		status: 'approved',
		tagline: card.tagline,
		about: 'Founded after the Kamino incident, Bright Star took in heroes nobody else would sign.\n\nToday it runs patrols across three wards and keeps a rescue team on call around the clock.',
		logo_url: '',
		banner_url: '',
		colour: card.colour,
		headquarters: card.headquarters,
		discord_url: 'https://discord.gg/example',
		recruiting: card.recruiting,
		approved_at: day(40),
		created_at: day(42),
		review_note: null,
		is_requester: false,
		// ?demo&as=leader (or member) shows the page as that member would see it.
		me: demoMe(),
		ranks: [
			{ id: 'r0', title: agency ? 'Agency Head' : 'Leader', sort: 0, leader: true, manage: true, spend: true, edit: true },
			{ id: 'r1', title: agency ? 'Sidekick Lead' : 'Officer', sort: 1, leader: false, manage: true, spend: true, edit: false },
			{ id: 'r2', title: agency ? 'Hero' : 'Member', sort: 2, leader: false, manage: false, spend: false, edit: false },
		],
		members: [
			{ id: 'm1', character: 'c1', name: card.leader ?? 'Leader', image: null, player: 'Tatsuya', rank: 'r0', joined_at: day(40), mine: false },
			{ id: 'm2', character: 'c2', name: 'Kenji Arata', image: null, player: 'Minako', rank: 'r1', joined_at: day(30), mine: false },
			{ id: 'm3', character: 'c3', name: 'Mika "Flashpoint" Sato', image: null, player: 'Geeked', rank: 'r2', joined_at: day(12), mine: false },
			{ id: 'm4', character: 'c4', name: 'Ren', image: null, player: 'Tamaki', rank: 'r2', joined_at: day(3), mine: demoAs() === 'member' },
		],
		requests: demoAs() === 'leader' ? [{ id: 'q1', character: 'c9', name: 'Yuki Tanaka', image: null, player: 'Rae', message: 'I want to help the eastern ward.', created_at: day(1), mine: false }] : [],
		wallet: {
			account: 'a1',
			balance: card.balance ?? 0,
			symbol: '¢',
			history: [
				{ id: 't1', kind: 'pay', memo: 'Patrol bonus', at: day(1), amount: -500, other: 'Ren' },
				{ id: 't2', kind: 'grant', memo: 'City contract', at: day(4), amount: 25000, other: null },
				{ id: 't3', kind: 'purchase', memo: 'Grappling hooks x3', at: day(9), amount: 1800, other: 'Kenji Arata' },
			],
		},
		shops: card.kind === 'corporation' ? [{ id: 's1', name: 'Kurogane Armory', description: 'Support gear.', image: null, status: 'open', items: 14 }] : [],
		points: card.points,
		duties: agency
			? [
					{ id: 'd1', character: 'Mika "Flashpoint" Sato', tier: 'Villain Capture', summary: 'Stopped the Hosu bank robbery', link: 'https://discord.com/channels/1/2/3', status: 'approved', points: 5, review_note: null, mine: false, at: day(2) },
					{ id: 'd2', character: 'Ren', tier: 'Rescue', summary: 'Pulled three civilians out of a collapsed building', link: 'https://discord.com/channels/1/2/4', status: 'approved', points: 3, review_note: null, mine: false, at: day(6) },
					{ id: 'd3', character: 'Kenji Arata', tier: 'Patrol', summary: 'Night patrol in the eastern ward', link: 'https://discord.com/channels/1/2/5', status: 'approved', points: 1, review_note: null, mine: false, at: day(8) },
				]
			: null,
	};
}

const demoAs = () => new URLSearchParams(location.search).get('as');
function demoMe(): Group['me'] {
	const as = demoAs();
	const leader = as === 'leader';
	return { leader, manage: leader, spend: leader, edit: leader, member: leader || as === 'member', admin: false };
}

export const DEMO_TIERS: Tier[] = [
	{ id: 't1', name: 'Patrol', points: 1, description: 'A patrol, guard shift or minor incident.', sort: 1, retired: false },
	{ id: 't2', name: 'Rescue', points: 3, description: 'Saving civilians from danger.', sort: 2, retired: false },
	{ id: 't3', name: 'Villain Capture', points: 5, description: 'Stopping and apprehending a villain.', sort: 3, retired: false },
	{ id: 't4', name: 'Disaster Response', points: 10, description: 'A major disaster or city-wide threat.', sort: 4, retired: false },
];

export const DEMO_MINE: Mine = {
	characters: [
		{ id: 'c4', name: 'Ren' },
		{ id: 'c8', name: 'Ren (Alt)' },
	],
	memberships: [
		{ id: 'm4', status: 'active', character: 'Ren', character_id: 'c4', group: 'Bright Star Agency', slug: 'bright-star-agency', kind: 'agency', logo: null, rank: 'Hero', leader: false },
		{ id: 'm9', status: 'requested', character: 'Ren (Alt)', character_id: 'c8', group: 'Kurogane Industries', slug: 'kurogane-industries', kind: 'corporation', logo: null, rank: 'Employee', leader: false },
	],
	requested: [{ id: 'g9', name: 'Night Owls', slug: 'night-owls', kind: 'organization', status: 'needs_correction', review_note: 'Please add a short about section.' }],
};

export const DEMO_RANKING: RankedAgency[] = [
	{ position: 1, id: '1', slug: 'bright-star-agency', name: 'Bright Star Agency', tagline: 'Always there when the city calls.', logo: null, colour: '#f2b134', points: 37, pinned: false, pin_note: null, members: 6, duties: 9 },
	{ position: 2, id: '2', slug: 'aegis', name: 'Aegis', tagline: 'Shield of the eastern ward.', logo: null, colour: '#3b82f6', points: 12, pinned: true, pin_note: 'Founding agency', members: 3, duties: 4 },
	{ position: 3, id: '5', slug: 'zenith', name: 'Zenith Heroes', tagline: '', logo: null, colour: '#a855f7', points: 15, pinned: false, pin_note: null, members: 2, duties: 5 },
];

export const DEMO_QUEUE: AdminQueue = {
	groups: [
		{ id: 'g9', slug: 'night-owls', kind: 'organization', name: 'Night Owls', tagline: 'Information brokers of the lower city.', about: 'A loose network of informants who sell secrets to whoever pays.\n\nRun out of a jazz bar.', logo_url: '', banner_url: '', headquarters: 'Lower City', submitted_at: day(1), requester: 'Rae', leader: 'Yuki Tanaka' },
	],
	duties: [
		{ id: 'd9', group: 'Bright Star Agency', slug: 'bright-star-agency', character: 'Ren', player: 'Tamaki', tier: 'Rescue', points: 3, summary: 'Pulled a kid out of the river', details: 'During the flood scene.', link: 'https://discord.com/channels/1/2/9', at: day(0) },
	],
};
