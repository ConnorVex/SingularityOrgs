// Admin review (/admin/?tab=): group requests, hero duties, ranking points and pins, and duty types.
// The database refuses all of this for non-admins; the page just doesn't show it to them.
import { useEffect, useState } from 'preact/hooks';
import {
	awardPoints,
	demoMode,
	groupHref,
	kindLabel,
	loadAdminQueue,
	loadRanking,
	loadTiers,
	messageOf,
	pinAgency,
	plural,
	reviewDuty,
	reviewGroup,
	saveTier,
	type AdminQueue,
	type RankedAgency,
	type Tier,
} from '../lib/orgs.ts';
import { logIn, siteConfigured, watchPlayer, type Player } from '../lib/supabase.ts';
import { useAction } from './GroupActions.tsx';

type Tab = 'groups' | 'duties' | 'points' | 'tiers';
const TABS: { id: Tab; label: string }[] = [
	{ id: 'groups', label: 'Group requests' },
	{ id: 'duties', label: 'Hero duties' },
	{ id: 'points', label: 'Points & pins' },
	{ id: 'tiers', label: 'Duty types' },
];

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function GroupRequests({ queue, reload }: { queue: AdminQueue; reload: () => Promise<void> }) {
	const [notes, setNotes] = useState<Record<string, string>>({});
	const { busy, error, run } = useAction(reload);
	if (!queue.groups.length) return <p class="pf-empty">No group requests waiting.</p>;
	return (
		<div class="og-mine">
			{queue.groups.map((g) => {
				const note = notes[g.id] ?? '';
				const decide = (outcome: 'approved' | 'needs_correction' | 'denied', confirmText?: string) =>
					run(g.id, () => reviewGroup(g.id, outcome, note), confirmText);
				return (
					<article class="portal-card" key={g.id}>
						<header class="gp-row">
							<span>
								<a class="gp-review-name" href={groupHref(g.slug)}>
									{g.name}
								</a>
								<span class="gp-list-sub">
									{' '}
									· {kindLabel(g.kind)} · led by {g.leader ?? '?'} · requested by {g.requester ?? '?'} · {date(g.submitted_at)}
								</span>
							</span>
						</header>
						{g.tagline && <p class="gp-review-tagline">{g.tagline}</p>}
						{g.about && <p class="gp-about gp-review-about">{g.about}</p>}
						{g.headquarters && (
							<p class="gp-list-sub">
								<strong>Headquarters:</strong> {g.headquarters}
							</p>
						)}
						<label class="pf-field gp-review-note">
							<span class="pf-label">Note to the player (shown on their My Groups page)</span>
							<textarea rows={2} maxLength={2000} value={note} onInput={(e) => setNotes((n) => ({ ...n, [g.id]: e.currentTarget.value }))} />
						</label>
						<div class="gp-actions">
							<button type="button" class="pf-button danger" disabled={busy === g.id}
								onClick={() => decide('denied', `Deny ${g.name}? This is final: the player has to request a new group.`)}>
								Deny
							</button>
							<button type="button" class="pf-button" disabled={busy === g.id || !note.trim()} title={note.trim() ? '' : 'Write a note saying what to fix'}
								onClick={() => decide('needs_correction')}>
								Send back
							</button>
							<button type="button" class="pf-button primary" disabled={busy === g.id} onClick={() => decide('approved')}>
								Approve
							</button>
						</div>
					</article>
				);
			})}
			{error && <p class="portal-error">{error}</p>}
		</div>
	);
}

function Duties({ queue, reload }: { queue: AdminQueue; reload: () => Promise<void> }) {
	const [notes, setNotes] = useState<Record<string, string>>({});
	const { busy, error, run } = useAction(reload);
	if (!queue.duties.length) return <p class="pf-empty">No hero duties waiting.</p>;
	return (
		<div class="og-mine">
			{queue.duties.map((d) => (
				<article class="portal-card" key={d.id}>
					<header class="gp-row">
						<span class="gp-points">+{d.points}</span>
						<span class="gp-list-main">
							<a href={d.link} target="_blank" rel="noopener">
								{d.summary} ↗
							</a>
							<span class="gp-list-sub">
								{d.tier} · {d.character} ({d.player ?? '?'}) · <a href={groupHref(d.slug)}>{d.group}</a> · {date(d.at)}
							</span>
						</span>
					</header>
					{d.details && <p class="gp-about gp-review-about">{d.details}</p>}
					<label class="pf-field gp-review-note">
						<span class="pf-label">Note (optional, shown to the player)</span>
						<input maxLength={1000} value={notes[d.id] ?? ''} onInput={(e) => setNotes((n) => ({ ...n, [d.id]: e.currentTarget.value }))} />
					</label>
					<div class="gp-actions">
						<button type="button" class="pf-button danger" disabled={busy === d.id} onClick={() => run(d.id, () => reviewDuty(d.id, false, notes[d.id] ?? ''))}>
							Deny
						</button>
						<button type="button" class="pf-button primary" disabled={busy === d.id} onClick={() => run(d.id, () => reviewDuty(d.id, true, notes[d.id] ?? ''))}>
							Approve +{d.points}
						</button>
					</div>
				</article>
			))}
			{error && <p class="portal-error">{error}</p>}
		</div>
	);
}

function PointsAndPins({ ranking, reload }: { ranking: RankedAgency[]; reload: () => Promise<void> }) {
	const [agency, setAgency] = useState(ranking[0]?.id ?? '');
	const [points, setPoints] = useState('');
	const [reason, setReason] = useState('');
	const [pinAt, setPinAt] = useState('');
	const [pinNote, setPinNote] = useState('');
	const { busy, error, run } = useAction(reload);
	if (!ranking.length) return <p class="pf-empty">No approved Hero Agencies yet.</p>;
	const picked = ranking.find((a) => a.id === agency);
	const n = Number(points);

	return (
		<div class="og-mine">
			<section class="portal-card">
				<h3 class="gp-rank-title">Award or take points</h3>
				<p class="pf-help">Points count on the ranking for 30 days, like duties. Use a minus number to take points away.</p>
				<form
					class="pf-grid"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run('award', () => awardPoints(agency, n, reason.trim()))) {
							setPoints('');
							setReason('');
						}
					}}
				>
					<label class="pf-field">
						<span class="pf-label">Agency</span>
						<select value={agency} onChange={(e) => setAgency(e.currentTarget.value)}>
							{ranking.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</label>
					<label class="pf-field">
						<span class="pf-label">Points</span>
						<input type="number" min={-10000} max={10000} step={1} value={points} placeholder="e.g. 10 or -5" onInput={(e) => setPoints(e.currentTarget.value)} />
					</label>
					<label class="pf-field pf-wide">
						<span class="pf-label">Reason</span>
						<input maxLength={200} value={reason} placeholder="e.g. Won the Sports Festival event" onInput={(e) => setReason(e.currentTarget.value)} />
					</label>
					<div class="gp-actions pf-wide">
						<button type="submit" class="pf-button primary" disabled={!Number.isInteger(n) || n === 0 || !reason.trim() || busy === 'award'}>
							{n < 0 ? `Take ${-n} points` : `Award ${n || ''} points`}
						</button>
					</div>
				</form>
				{picked && (
					<div class="gp-sub">
						<h3 class="gp-rank-title">Pin {picked.name}</h3>
						<p class="pf-help">
							A pinned agency holds its place on the ranking whatever its points. {picked.pinned ? `Now pinned at #${picked.position}.` : 'Not pinned.'}
						</p>
						<p class="gp-row">
							<span class="pf-field gp-pin-at">
								<input type="number" min={1} max={100} value={pinAt} placeholder="#" aria-label="Place" onInput={(e) => setPinAt(e.currentTarget.value)} />
							</span>
							<span class="pf-field gp-grow">
								<input maxLength={200} value={pinNote} placeholder="Note (optional, shown on the ranking)" aria-label="Pin note" onInput={(e) => setPinNote(e.currentTarget.value)} />
							</span>
							<button type="button" class="pf-button" disabled={!(Number(pinAt) >= 1) || busy === 'pin'}
								onClick={async () => (await run('pin', () => pinAgency(agency, Number(pinAt), pinNote.trim()))) && (setPinAt(''), setPinNote(''))}>
								Pin
							</button>
							{picked.pinned && (
								<button type="button" class="pf-button subtle" disabled={busy === 'pin'} onClick={() => run('pin', () => pinAgency(agency, null, ''))}>
									Unpin
								</button>
							)}
						</p>
					</div>
				)}
				{error && <p class="portal-error">{error}</p>}
			</section>
			<section class="portal-card">
				<h3 class="gp-rank-title">Ranking now</h3>
				<ul class="gp-list">
					{ranking.map((a) => (
						<li key={a.id}>
							<span class="gp-points">#{a.position}</span>
							<span class="gp-list-main">
								<a href={groupHref(a.slug)}>{a.name}</a>
								<span class="gp-list-sub">
									{plural(a.points, 'point')} · {a.duties} {a.duties === 1 ? 'duty' : 'duties'} in 30 days
									{a.pinned && ` · pinned${a.pin_note ? `: ${a.pin_note}` : ''}`}
								</span>
							</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

function Tiers({ tiers, reload }: { tiers: Tier[]; reload: () => Promise<void> }) {
	const [draft, setDraft] = useState<Record<string, Tier>>({});
	const [fresh, setFresh] = useState({ name: '', points: '' });
	const { busy, error, run } = useAction(reload);
	const rows = tiers.map((t) => draft[t.id] ?? t);
	const change = (t: Tier, patch: Partial<Tier>) => setDraft((d) => ({ ...d, [t.id]: { ...t, ...patch } }));
	const dirty = (t: Tier) => JSON.stringify(t) !== JSON.stringify(tiers.find((x) => x.id === t.id));

	return (
		<section class="portal-card">
			<p class="pf-help">
				What each kind of hero duty is worth. Changing points only affects duties approved from now on. Retire a type instead of removing it, so old duties keep it.
			</p>
			<ul class="gp-ranks">
				{rows.map((t) => (
					<li key={t.id} class={t.retired ? 'gp-retired' : undefined}>
						<input class="gp-rank-sort" type="number" value={t.sort} aria-label="Order" onInput={(e) => change(t, { sort: Number(e.currentTarget.value) || 0 })} />
						<input class="gp-rank-name" value={t.name} maxLength={60} aria-label="Name" onInput={(e) => change(t, { name: e.currentTarget.value })} />
						<label class="gp-tier-points">
							<input type="number" min={1} max={1000} value={t.points} aria-label="Points"
								onInput={(e) => change(t, { points: Number(e.currentTarget.value) || 1 })} />
							<span>pts</span>
						</label>
						<input class="gp-tier-desc" value={t.description} maxLength={300} placeholder="Description" aria-label="Description"
							onInput={(e) => change(t, { description: e.currentTarget.value })} />
						<label class="pf-check">
							<input type="checkbox" checked={t.retired} onChange={(e) => change(t, { retired: e.currentTarget.checked })} />
							Retired
						</label>
						{dirty(t) && (
							<button type="button" class="pf-button primary" disabled={busy === t.id}
								onClick={async () => (await run(t.id, () => saveTier(t))) && setDraft((d) => (delete d[t.id], { ...d }))}>
								Save
							</button>
						)}
					</li>
				))}
			</ul>
			<form
				class="gp-row"
				onSubmit={async (e) => {
					e.preventDefault();
					const sort = Math.max(0, ...tiers.map((t) => t.sort)) + 1;
					if (await run('add', () => saveTier({ name: fresh.name.trim(), points: Number(fresh.points), sort }))) setFresh({ name: '', points: '' });
				}}
			>
				<span class="pf-field gp-grow">
					<input value={fresh.name} maxLength={60} placeholder="New duty type" aria-label="New duty type" onInput={(e) => setFresh((f) => ({ ...f, name: e.currentTarget.value }))} />
				</span>
				<span class="pf-field gp-pin-at">
					<input type="number" min={1} max={1000} value={fresh.points} placeholder="Pts" aria-label="Points" onInput={(e) => setFresh((f) => ({ ...f, points: e.currentTarget.value }))} />
				</span>
				<button type="submit" class="pf-button" disabled={!fresh.name.trim() || !(Number(fresh.points) >= 1) || busy === 'add'}>
					Add type
				</button>
			</form>
			{error && <p class="portal-error">{error}</p>}
		</section>
	);
}

export default function AdminPage() {
	const demo = demoMode();
	const [player, setPlayer] = useState<Player | null | undefined>(siteConfigured ? undefined : null);
	const [tab, setTab] = useState<Tab>(() => {
		const t = new URLSearchParams(location.search).get('tab');
		return TABS.some((x) => x.id === t) ? (t as Tab) : 'groups';
	});
	const [queue, setQueue] = useState<AdminQueue | null>(null);
	const [ranking, setRanking] = useState<RankedAgency[]>([]);
	const [tiers, setTiers] = useState<Tier[]>([]);
	const [error, setError] = useState('');
	const allowed = demo || Boolean(player?.isAdmin);

	const reload = async () => {
		const [q, r, t] = await Promise.all([loadAdminQueue(), loadRanking(), loadTiers()]);
		setQueue(q);
		setRanking(r);
		setTiers(t);
	};
	useEffect(() => (siteConfigured ? watchPlayer((p) => setPlayer(p)) : undefined), []);
	useEffect(() => {
		if (allowed) reload().catch((e) => setError(messageOf(e)));
	}, [allowed]);

	const pick = (t: Tab) => {
		setTab(t);
		const url = new URL(location.href);
		url.searchParams.set('tab', t);
		history.replaceState(null, '', url);
	};

	if (!demo && player === undefined) return <p class="portal-status">Checking your login…</p>;
	if (!demo && player === null)
		return (
			<div class="pf gp">
				<p class="pf-empty">Admins log in here to review groups and hero duties.</p>
				<p>
					<button type="button" class="portal-button discord" onClick={() => logIn().catch((e) => setError(messageOf(e)))}>
						Log in with Discord
					</button>
				</p>
			</div>
		);
	if (!allowed) return <p class="pf-empty">Only admins can open this page.</p>;
	if (error) return <p class="portal-error">{error}</p>;
	if (!queue) return <p class="portal-status">Loading…</p>;

	const count = (t: Tab) => (t === 'groups' ? queue.groups.length : t === 'duties' ? queue.duties.length : 0);
	return (
		<div class="pf gp">
			<nav class="pf-nav" aria-label="Admin sections">
				{TABS.map((t) => (
					<a key={t.id} href={`?tab=${t.id}`} class={tab === t.id ? 'active' : undefined} aria-current={tab === t.id ? 'true' : undefined}
						onClick={(e) => (e.preventDefault(), pick(t.id))}>
						{t.label}
						{count(t.id) > 0 && <span class="gp-count"> {count(t.id)}</span>}
					</a>
				))}
			</nav>
			{tab === 'groups' && <GroupRequests queue={queue} reload={reload} />}
			{tab === 'duties' && <Duties queue={queue} reload={reload} />}
			{tab === 'points' && <PointsAndPins ranking={ranking} reload={reload} />}
			{tab === 'tiers' && <Tiers tiers={tiers} reload={reload} />}
		</div>
	);
}
