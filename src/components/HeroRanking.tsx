// Hero Agency Ranking: agencies ordered by points from approved hero duties and admin awards
// in the last 30 days. Admins can pin an agency to a place; the database works out the order.
import { useEffect, useState } from 'preact/hooks';
import { groupHref, loadRanking, loadTiers, messageOf, plural, requestHref, type RankedAgency, type Tier } from '../lib/orgs.ts';

function Logo({ a }: { a: RankedAgency }) {
	return a.logo && /^https:\/\//.test(a.logo) ? <img class="hr-logo" src={a.logo} alt="" loading="lazy" /> : <span class="hr-logo">{a.name.slice(0, 1)}</span>;
}

const place = (n: number) => {
	const end = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
	return `${n}${end}`;
};

function Stats({ a }: { a: RankedAgency }) {
	return (
		<span class="hr-stats">
			{plural(a.members, 'member')} · {a.duties} {a.duties === 1 ? 'duty' : 'duties'} in 30 days
		</span>
	);
}

function Pinned({ a }: { a: RankedAgency }) {
	if (!a.pinned) return null;
	return (
		<span class="gp-chip special" title={a.pin_note ?? 'Placed by an admin'}>
			Pinned{a.pin_note ? `: ${a.pin_note}` : ''}
		</span>
	);
}

function Podium({ a }: { a: RankedAgency }) {
	return (
		<a class={`hr-podium hr-p${a.position}`} href={groupHref(a.slug)} style={{ '--grp': a.colour }}>
			<span class="hr-place">{place(a.position)}</span>
			<Logo a={a} />
			<strong class="hr-name">{a.name}</strong>
			{a.tagline && <span class="hr-tagline">{a.tagline}</span>}
			<span class="hr-points">
				{a.points.toLocaleString()} <small>pts</small>
			</span>
			<Stats a={a} />
			<Pinned a={a} />
		</a>
	);
}

export default function HeroRanking() {
	const [ranking, setRanking] = useState<RankedAgency[] | null>(null);
	const [tiers, setTiers] = useState<Tier[]>([]);
	const [error, setError] = useState('');

	useEffect(() => {
		loadRanking().then(setRanking, (e) => setError(messageOf(e)));
		loadTiers().then((t) => setTiers(t.filter((x) => !x.retired)), () => {});
	}, []);

	if (error) return <p class="portal-error">{error}</p>;
	if (!ranking) return <p class="portal-status">Loading the ranking…</p>;

	const top = ranking.slice(0, 3);
	const rest = ranking.slice(3);

	return (
		<div class="pf gp hr">
			<p class="pf-intro">
				Hero Agencies ranked by <strong>points</strong> earned in the <strong>last 30 days</strong>: approved hero duties logged by their members, plus
				points awarded by admins. Older points drop off, so the ranking keeps moving.
			</p>

			{ranking.length === 0 ? (
				<section class="portal-card">
					<p class="pf-empty">No Hero Agencies are ranked yet.</p>
					<p class="gp-row">
						<a class="pf-button primary" href={requestHref('agency')}>
							+ Request a Hero Agency
						</a>
					</p>
				</section>
			) : (
				<>
					<div class={`hr-top hr-top-${top.length}`}>
						{top.map((a) => (
							<Podium key={a.id} a={a} />
						))}
					</div>
					{rest.length > 0 && (
						<section class="portal-card">
							<ol class="hr-list">
								{rest.map((a) => (
									<li key={a.id} style={{ '--grp': a.colour }}>
										<span class="hr-num">#{a.position}</span>
										<Logo a={a} />
										<span class="hr-main">
											<a href={groupHref(a.slug)}>{a.name}</a>
											<Stats a={a} />
											<Pinned a={a} />
										</span>
										<span class="hr-points">
											{a.points.toLocaleString()} <small>pts</small>
										</span>
									</li>
								))}
							</ol>
						</section>
					)}
				</>
			)}

			{tiers.length > 0 && (
				<section class="portal-card hr-how">
					<h3 class="gp-rank-title">How agencies earn points</h3>
					<p class="pf-help">
						A member of an agency logs a hero duty on the agency’s page with a link to the roleplay. Once an admin approves it, the agency gets the points
						for that kind of duty.
					</p>
					<ul class="hr-tiers">
						{tiers.map((t) => (
							<li key={t.id}>
								<span class="hr-tier-points">{t.points}</span>
								<span class="hr-main">
									<strong>{t.name}</strong>
									{t.description && <span class="hr-stats">{t.description}</span>}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
