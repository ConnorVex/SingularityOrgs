// My Groups: the groups your characters are in or asked to join, and the groups you requested.
// `compact` is the short version on the home page.
import { useEffect, useState } from 'preact/hooks';
import {
	demoMode,
	groupHref,
	kindLabel,
	loadMine,
	messageOf,
	mineHref,
	newGroupHref,
	removeMember,
	STATUS_TEXT,
	type Mine,
} from '../lib/orgs.ts';
import { logIn, siteConfigured, watchPlayer, type Player } from '../lib/supabase.ts';

function Logo({ name, logo }: { name: string; logo: string | null }) {
	return logo && /^https:\/\//.test(logo) ? <img class="gp-avatar" src={logo} alt="" loading="lazy" /> : <span class="gp-avatar">{name.slice(0, 1)}</span>;
}

export function MyGroupsList({ mine, compact, reload }: { mine: Mine; compact?: boolean; reload?: () => void }) {
	const [error, setError] = useState('');
	const active = mine.memberships.filter((m) => m.status === 'active');
	const waiting = mine.memberships.filter((m) => m.status === 'requested');
	const requested = mine.requested.filter((r) => r.status !== 'denied' || !compact);

	if (!active.length && !waiting.length && !requested.length)
		return (
			<section class="portal-card">
				<p class="pf-empty">Your characters aren’t in any groups yet. Open a group’s page to ask to join, or request a new group.</p>
			</section>
		);

	return (
		<div class="og-mine">
			{requested.length > 0 && (
				<section class="portal-card">
					<h3 class="gp-rank-title">Your group requests</h3>
					<ul class="gp-list">
						{requested.map((r) => (
							<li key={r.id}>
								<span class="gp-list-main">
									<a href={groupHref(r.slug)}>{r.name}</a>
									<span class="gp-list-sub">
										{kindLabel(r.kind)}
										{r.review_note && ` · Admin note: ${r.review_note}`}
									</span>
								</span>
								<span class={`gp-chip ${r.status === 'needs_correction' ? 'warn' : r.status === 'denied' ? 'bad' : ''}`}>{STATUS_TEXT[r.status]}</span>
								{r.status === 'needs_correction' && (
									<a class="pf-button subtle" href={newGroupHref(r.slug)}>
										Fix it
									</a>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
			{active.length > 0 && (
				<section class="portal-card">
					<h3 class="gp-rank-title">Member of</h3>
					<ul class="gp-list">
						{active.map((m) => (
							<li key={m.id}>
								<Logo name={m.group} logo={m.logo} />
								<span class="gp-list-main">
									<a href={groupHref(m.slug)}>{m.group}</a>
									<span class="gp-list-sub">
										{m.character} · {m.rank}
										{!compact && ` · ${kindLabel(m.kind)}`}
									</span>
								</span>
								{m.leader && <span class="gp-chip special">Leader</span>}
							</li>
						))}
					</ul>
				</section>
			)}
			{waiting.length > 0 && (
				<section class="portal-card">
					<h3 class="gp-rank-title">Waiting to join</h3>
					<ul class="gp-list">
						{waiting.map((m) => (
							<li key={m.id}>
								<Logo name={m.group} logo={m.logo} />
								<span class="gp-list-main">
									<a href={groupHref(m.slug)}>{m.group}</a>
									<span class="gp-list-sub">{m.character}</span>
								</span>
								{reload && (
									<button type="button" class="pf-button subtle" onClick={() => removeMember(m.id).then(reload, (e) => setError(messageOf(e)))}>
										Withdraw
									</button>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
			{compact && (
				<p class="gp-row">
					<a href={mineHref()}>All my groups →</a>
				</p>
			)}
			{error && <p class="portal-error">{error}</p>}
		</div>
	);
}

export default function MyGroups() {
	const demo = demoMode();
	const [player, setPlayer] = useState<Player | null | undefined>(siteConfigured ? undefined : null);
	const [mine, setMine] = useState<Mine | null>(null);
	const [error, setError] = useState('');
	const reload = () => loadMine().then(setMine, (e) => setError(messageOf(e)));

	useEffect(() => (siteConfigured ? watchPlayer((p) => setPlayer(p)) : undefined), []);
	useEffect(() => {
		if (player || demo) reload();
	}, [player?.id, demo]);

	if (!demo && player === undefined) return <p class="portal-status">Checking your login…</p>;
	if (!demo && player === null)
		return (
			<div class="pf gp">
				<p class="pf-empty">Log in to see your groups.</p>
				<p>
					<button type="button" class="portal-button discord" disabled={!siteConfigured} onClick={() => logIn().catch((e) => setError(messageOf(e)))}>
						Log in with Discord
					</button>
				</p>
			</div>
		);
	if (error) return <p class="portal-error">{error}</p>;
	if (!mine) return <p class="portal-status">Loading your groups…</p>;
	return (
		<div class="pf gp">
			<p class="gp-row">
				<a class="pf-button primary" href={newGroupHref()}>
					+ Request a group
				</a>
			</p>
			<MyGroupsList mine={mine} reload={reload} />
		</div>
	);
}
