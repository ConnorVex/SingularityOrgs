// One group's page (?g=slug): profile, members by rank, wallet, shops and, for Hero Agencies,
// their hero duties. The page takes on the group's colour.
import { useEffect, useState } from 'preact/hooks';
import { groupsHref, kindLabel, loadGroup, messageOf, money, plural, shopHref, STATUS_TEXT, type Group, type Member } from '../lib/orgs.ts';
import { siteConfigured } from '../lib/supabase.ts';

const slugFromUrl = () => new URLSearchParams(location.search).get('g') ?? '';
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const https = (url: string | null | undefined) => (url && /^https:\/\//.test(url) ? url : null);

function Avatar({ name, image }: { name: string; image: string | null }) {
	const src = https(image);
	return src ? <img class="gp-avatar" src={src} alt="" loading="lazy" /> : <span class="gp-avatar">{name.slice(0, 1)}</span>;
}

function Section(props: { id: string; title: string; aside?: string; children: preact.ComponentChildren }) {
	return (
		<section class="pf-section" id={props.id}>
			<header class="pf-section-head">
				<h2>{props.title}</h2>
				{props.aside && <span class="gp-aside">{props.aside}</span>}
			</header>
			{props.children}
		</section>
	);
}

function Members({ g }: { g: Group }) {
	const byRank = g.ranks.map((r) => ({ rank: r, members: g.members.filter((m) => m.rank === r.id) })).filter((x) => x.members.length > 0);
	return (
		<Section id="members" title="Members" aside={plural(g.members.length, 'member')}>
			{byRank.map(({ rank, members }) => (
				<div class="gp-rank" key={rank.id}>
					<h3 class="gp-rank-title">
						{rank.title}
						{rank.leader && <span class="gp-tag">Leader</span>}
					</h3>
					<ul class="gp-members">
						{members.map((m: Member) => (
							<li key={m.id}>
								<Avatar name={m.name} image={m.image} />
								<span class="gp-member-text">
									<strong>{m.name}</strong>
									<span>{m.player}</span>
								</span>
							</li>
						))}
					</ul>
				</div>
			))}
		</Section>
	);
}

function Duties({ g }: { g: Group }) {
	const duties = g.duties ?? [];
	return (
		<Section id="duties" title="Hero duties" aside={`${plural(g.points ?? 0, 'point')} in the last 30 days`}>
			{duties.length === 0 ? (
				<p class="pf-empty">No hero duties logged yet.</p>
			) : (
				<ul class="gp-list">
					{duties.map((d) => (
						<li key={d.id}>
							<span class="gp-points">+{d.points}</span>
							<span class="gp-list-main">
								<a href={d.link} target="_blank" rel="noopener">
									{d.summary}
								</a>
								<span class="gp-list-sub">
									{d.tier} · {d.character} · {date(d.at)}
								</span>
							</span>
							{d.status !== 'approved' && <span class={`gp-chip ${d.status === 'denied' ? 'bad' : 'warn'}`}>{d.status === 'denied' ? 'Denied' : 'Waiting'}</span>}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

function Wallet({ g }: { g: Group }) {
	const w = g.wallet!;
	return (
		<Section id="wallet" title="Wallet" aside={money(w.balance, w.symbol)}>
			{w.history.length === 0 ? (
				<p class="pf-empty">No money has moved yet.</p>
			) : (
				<ul class="gp-list">
					{w.history.map((t) => (
						<li key={t.id}>
							<span class={`gp-amount ${t.amount < 0 ? 'out' : 'in'}`}>
								{t.amount < 0 ? '−' : '+'}
								{money(Math.abs(t.amount), w.symbol)}
							</span>
							<span class="gp-list-main">
								<span>{t.memo || (t.amount < 0 ? 'Payment' : 'Deposit')}</span>
								<span class="gp-list-sub">
									{[t.other && `${t.amount < 0 ? 'to' : 'from'} ${t.other}`, date(t.at)].filter(Boolean).join(' · ')}
								</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

function Shops({ g }: { g: Group }) {
	return (
		<Section id="shops" title="Shops">
			<ul class="gp-shops">
				{g.shops.map((s) => (
					<li key={s.id}>
						<a href={shopHref(s.id)}>{s.name}</a>
						<span class="gp-list-sub">
							{s.status === 'open' ? plural(s.items, 'item') : s.status === 'pending' ? 'Waiting for review' : 'Closed'}
						</span>
					</li>
				))}
			</ul>
		</Section>
	);
}

export default function GroupPage() {
	const [group, setGroup] = useState<Group | null | undefined>(undefined);
	const [error, setError] = useState(siteConfigured ? '' : 'The site is not connected to its database yet.');

	useEffect(() => {
		const slug = slugFromUrl();
		if (!slug) return setGroup(null);
		if (siteConfigured) loadGroup(slug).then(setGroup, (e) => setError(messageOf(e)));
	}, []);
	useEffect(() => {
		if (group) document.title = `${group.name} | Singularity Orgs`;
	}, [group?.name]);

	if (error) return <p class="portal-error">Couldn’t load this group: {error}</p>;
	if (group === undefined) return <p class="portal-status">Loading…</p>;
	if (group === null)
		return (
			<div class="pf gp">
				<p class="pf-empty">This group doesn’t exist, or it isn’t approved yet.</p>
				<p>
					<a class="pf-button" href={groupsHref()}>
						← All groups
					</a>
				</p>
			</div>
		);

	const g = group;
	const banner = https(g.banner_url);
	const logo = https(g.logo_url);
	const leader = g.members.find((m) => g.ranks.find((r) => r.id === m.rank)?.leader);

	return (
		<div class="pf gp gp-page" style={{ '--pf-accent': g.colour }}>
			<p class="gp-back">
				<a href={groupsHref(g.kind)}>← {kindLabel(g.kind)} directory</a>
			</p>
			{g.status !== 'approved' && (
				<div class={`pf-status status-${g.status}`}>
					<strong>{STATUS_TEXT[g.status]}.</strong> Only you, its members and admins can see this page until it’s approved.
					{g.review_note && <p class="gp-note">Admin note: {g.review_note}</p>}
				</div>
			)}
			<header class={`gp-hero${banner ? ' has-banner' : ''}`}>
				{banner && <img class="gp-hero-img" src={banner} alt="" />}
				<div class="gp-hero-text">
					<div class="gp-hero-row">
						{logo ? <img class="gp-logo" src={logo} alt="" /> : <span class="gp-logo">{g.name.slice(0, 1)}</span>}
						<div class="gp-hero-name">
							<p class="gp-chips">
								<span class="gp-chip special">{kindLabel(g.kind)}</span>
								<span class={`gp-chip ${g.recruiting ? 'good' : 'muted'}`}>{g.recruiting ? 'Recruiting' : 'Closed'}</span>
							</p>
							<h1 class="gp-title">{g.name}</h1>
						</div>
					</div>
					{g.tagline && <p class="gp-lead">{g.tagline}</p>}
				</div>
			</header>

			<dl class="og-facts">
				<div>
					<dt>{g.ranks.find((r) => r.leader)?.title ?? 'Leader'}</dt>
					<dd>{leader?.name ?? '—'}</dd>
				</div>
				<div>
					<dt>Members</dt>
					<dd>{g.members.length}</dd>
				</div>
				{g.wallet && (
					<div>
						<dt>Funds</dt>
						<dd>{money(g.wallet.balance, g.wallet.symbol)}</dd>
					</div>
				)}
				{g.kind === 'agency' ? (
					<div>
						<dt>Points (30 days)</dt>
						<dd>{g.points ?? 0}</dd>
					</div>
				) : (
					<div>
						<dt>Founded</dt>
						<dd>{date(g.approved_at ?? g.created_at)}</dd>
					</div>
				)}
			</dl>

			{(g.about || g.headquarters || https(g.discord_url)) && (
				<Section id="about" title="About">
					{g.about && <p class="gp-about">{g.about}</p>}
					<p class="gp-meta">
						{g.headquarters && (
							<span>
								<strong>Headquarters:</strong> {g.headquarters}
							</span>
						)}
						{https(g.discord_url) && (
							<a href={g.discord_url} target="_blank" rel="noopener">
								Discord server ↗
							</a>
						)}
					</p>
				</Section>
			)}

			<Members g={g} />
			{g.kind === 'agency' && <Duties g={g} />}
			{g.wallet && <Wallet g={g} />}
			{g.shops.length > 0 && <Shops g={g} />}
		</div>
	);
}
