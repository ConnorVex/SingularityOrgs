// Groups directory: every approved Organization, Corporation and Hero Agency as a card,
// filtered by kind (?type=) and searchable.
import { useEffect, useState } from 'preact/hooks';
import { groupHref, KINDS, kindLabel, loadDirectory, messageOf, money, plural, type GroupCard, type Kind } from '../lib/orgs.ts';
import { siteConfigured } from '../lib/supabase.ts';

type Filter = Kind | 'all';

const readFilter = (): Filter => {
	const t = new URLSearchParams(location.search).get('type');
	return KINDS.some((k) => k.id === t) ? (t as Kind) : 'all';
};

function Card({ g }: { g: GroupCard }) {
	return (
		<article class="gp-card" style={{ '--grp': g.colour }}>
			<a class="gp-card-art" href={groupHref(g.slug)} tabIndex={-1} aria-hidden="true">
				{g.logo ? <img class="gp-card-logo" src={g.logo} alt="" loading="lazy" /> : <span>{g.name.slice(0, 1)}</span>}
			</a>
			<div class="gp-card-body">
				<h2 class="gp-card-title">
					<a href={groupHref(g.slug)}>{g.name}</a>
				</h2>
				<p class="gp-chips">
					<span class="gp-chip special">{kindLabel(g.kind)}</span>
					<span class={`gp-chip ${g.recruiting ? 'good' : 'muted'}`}>{g.recruiting ? 'Recruiting' : 'Closed'}</span>
					{g.points !== null && <span class="gp-chip">{plural(g.points, 'pt')}</span>}
				</p>
				{g.tagline && <p class="gp-card-text">{g.tagline}</p>}
				<p class="gp-card-meta">
					{[g.leader && `Led by ${g.leader}`, plural(g.members, 'member'), g.balance !== null && money(g.balance), g.headquarters].filter(Boolean).join(' · ')}
				</p>
			</div>
		</article>
	);
}

export default function GroupDirectory() {
	const [groups, setGroups] = useState<GroupCard[] | null>(null);
	const [filter, setFilter] = useState<Filter>(readFilter);
	const [search, setSearch] = useState('');
	const [error, setError] = useState(siteConfigured ? '' : 'The site is not connected to its database yet.');

	useEffect(() => {
		if (siteConfigured) loadDirectory().then(setGroups, (e) => setError(messageOf(e)));
	}, []);

	const pick = (f: Filter) => {
		setFilter(f);
		const url = new URL(location.href);
		if (f === 'all') url.searchParams.delete('type');
		else url.searchParams.set('type', f);
		history.replaceState(null, '', url);
	};

	if (error) return <p class="portal-error">Couldn’t load the groups: {error}</p>;
	if (!groups) return <p class="portal-status">Loading groups…</p>;

	const tabs: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...KINDS.map((k) => ({ id: k.id, label: k.plural }))];
	const count = (f: Filter) => groups.filter((g) => f === 'all' || g.kind === f).length;
	const needle = search.trim().toLowerCase();
	const shown = groups
		.filter((g) => filter === 'all' || g.kind === filter)
		.filter((g) => !needle || `${g.name} ${g.tagline} ${g.leader ?? ''} ${g.headquarters}`.toLowerCase().includes(needle));

	return (
		<div class="pf gp">
			<div class="gp-top">
				<nav class="pf-nav" aria-label="Filter groups">
					{tabs.map((t) => (
						<a
							key={t.id}
							href={t.id === 'all' ? '?' : `?type=${t.id}`}
							class={filter === t.id ? 'active' : undefined}
							aria-current={filter === t.id ? 'true' : undefined}
							onClick={(e) => {
								e.preventDefault();
								pick(t.id);
							}}
						>
							{t.label} <span class="gp-count">{count(t.id)}</span>
						</a>
					))}
				</nav>
				<div class="pf-field gp-search">
					<label class="sr-only" for="gp-search">
						Search groups
					</label>
					<input id="gp-search" type="search" placeholder="Search groups…" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
				</div>
			</div>

			{shown.length === 0 ? (
				<p class="pf-empty">{count(filter) ? 'No groups match.' : filter === 'all' ? 'No groups yet.' : `No ${KINDS.find((k) => k.id === filter)!.plural} yet.`}</p>
			) : (
				<div class="gp-grid">
					{shown.map((g) => (
						<Card key={g.id} g={g} />
					))}
				</div>
			)}
		</div>
	);
}
