// Request a new group (/groups/new/) or edit one's page (/groups/new/?edit=slug).
// New groups are Permission Based: they wait for an admin before they're listed.
import { useEffect, useState } from 'preact/hooks';
import {
	demoMode,
	groupHref,
	groupsHref,
	KINDS,
	loadGroup,
	loadMine,
	messageOf,
	mineHref,
	requestGroup,
	resubmitGroup,
	STATUS_TEXT,
	updateGroup,
	type Group,
	type GroupFields,
	type Kind,
	type Mine,
} from '../lib/orgs.ts';
import { logIn, siteConfigured, watchPlayer, type Player } from '../lib/supabase.ts';

const BLANK: GroupFields = {
	name: '',
	tagline: '',
	about: '',
	logo_url: '',
	banner_url: '',
	colour: '#2fb45a',
	headquarters: '',
	discord_url: '',
	recruiting: true,
};

const KIND_HELP: Record<Kind, string> = {
	organization: 'Guilds, gangs, orders, secret societies and other groups.',
	corporation: 'Businesses. A Corporation can open a shop in the economy once approved.',
	agency: 'Licensed hero teams. Members log hero duties to climb the Hero Agency Ranking.',
};

const fieldsOf = (g: Group): GroupFields => ({
	name: g.name,
	tagline: g.tagline,
	about: g.about,
	logo_url: g.logo_url,
	banner_url: g.banner_url,
	colour: g.colour,
	headquarters: g.headquarters,
	discord_url: g.discord_url,
	recruiting: g.recruiting,
});

/** Problems the database would refuse, caught before sending. */
function problems(f: GroupFields): string[] {
	const list: string[] = [];
	if (f.name.trim().length < 2) list.push('Give the group a name (at least 2 characters).');
	for (const [key, label] of [
		['logo_url', 'Logo'],
		['banner_url', 'Banner'],
	] as const) {
		if (f[key].trim() && !/^https:\/\//.test(f[key].trim())) list.push(`${label} link must start with https://`);
	}
	if (f.discord_url.trim() && !/^https:\/\/(www\.)?(discord\.gg|discord\.com)\//.test(f.discord_url.trim()))
		list.push('The Discord link must be a discord.gg or discord.com invite.');
	return list;
}

function Field(props: { label: string; help?: string; wide?: boolean; children: preact.ComponentChildren }) {
	return (
		<label class={`pf-field${props.wide ? ' pf-wide' : ''}`}>
			<span class="pf-label">{props.label}</span>
			{props.children}
			{props.help && <span class="pf-help">{props.help}</span>}
		</label>
	);
}

export default function GroupForm() {
	const editSlug = new URLSearchParams(location.search).get('edit');
	const [player, setPlayer] = useState<Player | null | undefined>(siteConfigured ? undefined : null);
	const [mine, setMine] = useState<Mine | null>(null);
	const [group, setGroup] = useState<Group | null | undefined>(editSlug ? undefined : null);
	const [kind, setKind] = useState<Kind>(() => {
		const t = new URLSearchParams(location.search).get('type');
		return KINDS.some((k) => k.id === t) ? (t as Kind) : 'organization';
	});
	const [leader, setLeader] = useState('');
	const [f, setF] = useState<GroupFields>(BLANK);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [tried, setTried] = useState(false);
	// Sample data on the dev server acts as if logged in.
	const demo = demoMode();

	useEffect(() => (siteConfigured ? watchPlayer((p) => setPlayer(p)) : undefined), []);
	useEffect(() => {
		if (!player && !demo) return;
		if (editSlug)
			loadGroup(editSlug).then((g) => {
				setGroup(g);
				if (g) setF(fieldsOf(g));
			}, (e) => setError(messageOf(e)));
		else
			loadMine().then((m) => {
				setMine(m);
				setLeader((l) => l || m.characters[0]?.id || '');
			}, (e) => setError(messageOf(e)));
	}, [player?.id]);

	useEffect(() => {
		const h1 = document.querySelector('h1#_top');
		if (group && h1) h1.textContent = `Edit ${group.name}`;
	}, [group?.name]);

	const set = <K extends keyof GroupFields>(key: K, value: GroupFields[K]) => setF((old) => ({ ...old, [key]: value }));

	if (!demo && player === undefined) return <p class="portal-status">Checking your login…</p>;
	if (!demo && player === null)
		return (
			<div class="pf gp">
				<p class="pf-empty">Log in to {editSlug ? 'edit a group' : 'request a group'}.</p>
				<p>
					<button type="button" class="portal-button discord" disabled={!siteConfigured} onClick={() => logIn().catch((e) => setError(messageOf(e)))}>
						Log in with Discord
					</button>
				</p>
			</div>
		);
	if (error && !mine && group === undefined) return <p class="portal-error">{error}</p>;
	if (editSlug && group === undefined) return <p class="portal-status">Loading…</p>;
	if (editSlug && (!group || !(group.me.edit || group.is_requester)))
		return <p class="pf-empty">You can’t edit this group. Only its leader, ranks with the edit power, and admins can.</p>;
	if (!editSlug && !mine) return error ? <p class="portal-error">{error}</p> : <p class="portal-status">Loading your characters…</p>;
	if (!editSlug && mine!.characters.length === 0)
		return <p class="pf-empty">You need an approved character to lead a group. Get one approved on the Divine Database first.</p>;

	const list = problems(f);
	const nameLocked = Boolean(group && group.status === 'approved' && !group.me.admin);

	const save = async (andResend = false) => {
		setTried(true);
		if (list.length) return;
		setBusy(true);
		setError('');
		try {
			if (group) {
				const { name, ...rest } = f;
				await updateGroup(group.id, nameLocked ? rest : f);
				if (andResend) await resubmitGroup(group.id);
				location.href = groupHref(nameLocked ? group.slug : (await loadGroup(group.slug))?.slug ?? group.slug);
			} else {
				await requestGroup(kind, leader, f);
				location.href = mineHref();
			}
		} catch (e) {
			setError(messageOf(e));
			setBusy(false);
		}
	};

	return (
		<form
			class="pf gp gp-form"
			style={{ '--pf-accent': /^#[0-9a-f]{6}$/i.test(f.colour) ? f.colour : undefined }}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			{group ? (
				<div class={`pf-status status-${group.status}`}>
					<strong>Editing {group.name}.</strong> {group.status !== 'approved' && `${STATUS_TEXT[group.status]}.`}
					{group.review_note && <p class="gp-note">Admin note: {group.review_note}</p>}
				</div>
			) : (
				<p class="pf-intro">
					New groups are <strong>Permission Based</strong>: an admin reviews your request before the group is listed and its wallet opens. You can edit
					it while it waits.
				</p>
			)}

			{!group && (
				<section class="pf-section">
					<header class="pf-section-head">
						<h2>Kind and leader</h2>
					</header>
					<fieldset class="gp-kinds">
						<legend class="sr-only">Kind of group</legend>
						{KINDS.map((k) => (
							<label key={k.id} class={`gp-kind${kind === k.id ? ' active' : ''}`}>
								<input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
								<strong>{k.label}</strong>
								<span>{KIND_HELP[k.id]}</span>
							</label>
						))}
					</fieldset>
					<div class="pf-grid">
						<Field label="Led by" help="One of your approved characters. You can hand leadership to another member later.">
							<select value={leader} onChange={(e) => setLeader(e.currentTarget.value)}>
								{mine!.characters.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</Field>
					</div>
				</section>
			)}

			<section class="pf-section">
				<header class="pf-section-head">
					<h2>Profile</h2>
				</header>
				<div class="pf-grid">
					<Field label="Name" help={nameLocked ? 'Only an admin can rename an approved group.' : undefined}>
						<input value={f.name} maxLength={60} required disabled={nameLocked} onInput={(e) => set('name', e.currentTarget.value)} />
					</Field>
					<Field label="Headquarters">
						<input value={f.headquarters} maxLength={160} placeholder="e.g. Musutafu, Japan" onInput={(e) => set('headquarters', e.currentTarget.value)} />
					</Field>
					<Field label="Tagline" help="One line shown on the group's card." wide>
						<input value={f.tagline} maxLength={160} onInput={(e) => set('tagline', e.currentTarget.value)} />
					</Field>
					<Field label="About" help="History, goals, how to join. Blank lines start new paragraphs." wide>
						<textarea rows={8} value={f.about} maxLength={12000} onInput={(e) => set('about', e.currentTarget.value)} />
					</Field>
				</div>
			</section>

			<section class="pf-section">
				<header class="pf-section-head">
					<h2>Look and links</h2>
				</header>
				<div class="pf-grid">
					<Field label="Logo link" help="A square image, https:// link.">
						<input type="url" value={f.logo_url} placeholder="https://" onInput={(e) => set('logo_url', e.currentTarget.value)} />
					</Field>
					<Field label="Banner link" help="A wide image behind the name, https:// link.">
						<input type="url" value={f.banner_url} placeholder="https://" onInput={(e) => set('banner_url', e.currentTarget.value)} />
					</Field>
					<Field label="Colour" help="Used for the group's card and page.">
						<span class="gp-colour">
							<input type="color" value={f.colour} onInput={(e) => set('colour', e.currentTarget.value)} />
							<input value={f.colour} maxLength={7} onInput={(e) => set('colour', e.currentTarget.value)} />
						</span>
					</Field>
					<Field label="Discord invite">
						<input type="url" value={f.discord_url} placeholder="https://discord.gg/…" onInput={(e) => set('discord_url', e.currentTarget.value)} />
					</Field>
					<label class="pf-check pf-wide">
						<input type="checkbox" checked={f.recruiting} onChange={(e) => set('recruiting', e.currentTarget.checked)} />
						Recruiting: characters can ask to join
					</label>
				</div>
			</section>

			{tried && list.length > 0 && (
				<ul class="portal-error gp-problems">
					{list.map((p) => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
			{error && <p class="portal-error">{error}</p>}

			<div class="gp-actions">
				<a class="pf-button subtle" href={group ? groupHref(group.slug) : groupsHref()}>
					Cancel
				</a>
				{group?.status === 'needs_correction' && (group.is_requester || group.me.admin) && (
					<button type="button" class="pf-button" disabled={busy} onClick={() => save(true)}>
						Save and send for review
					</button>
				)}
				<button type="submit" class="pf-button primary" disabled={busy}>
					{busy ? 'Saving…' : group ? 'Save changes' : 'Send request'}
				</button>
			</div>
		</form>
	);
}
