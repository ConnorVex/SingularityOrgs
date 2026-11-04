// What a logged-in player can do on a group's page: ask to join, log a hero duty, and (with the
// right rank) manage join requests, members, ranks and leadership. The database checks every power
// again; these panels only show what the player's rank allows.
import { useState } from 'preact/hooks';
import {
	askToJoin,
	deleteGroup,
	deleteRank,
	logDuty,
	messageOf,
	mineHref,
	newGroupHref,
	removeMember,
	respondJoin,
	saveRank,
	setRank,
	transferLeader,
	type Group,
	type Mine,
	type Rank,
	type Tier,
} from '../lib/orgs.ts';

/** Runs an action, shows its error, and reloads the group when it worked. */
export function useAction(reload: () => Promise<void>) {
	const [busy, setBusy] = useState('');
	const [error, setError] = useState('');
	const run = async (key: string, fn: () => Promise<unknown>, confirmText?: string) => {
		if (confirmText && !confirm(confirmText)) return false;
		setBusy(key);
		setError('');
		try {
			await fn();
			await reload();
			return true;
		} catch (e) {
			setError(messageOf(e));
			return false;
		} finally {
			setBusy('');
		}
	};
	return { busy, error, run };
}

function Panel(props: { title: string; children: preact.ComponentChildren; id?: string }) {
	return (
		<section class="pf-section" id={props.id}>
			<header class="pf-section-head">
				<h2>{props.title}</h2>
			</header>
			{props.children}
		</section>
	);
}

/** Characters of the player's that aren't in this group or waiting to join it. */
const freeCharacters = (g: Group, mine: Mine) =>
	mine.characters.filter((c) => !g.members.some((m) => m.character === c.id) && !g.requests.some((r) => r.character === c.id));

export function JoinPanel({ g, mine, reload }: { g: Group; mine: Mine; reload: () => Promise<void> }) {
	const free = freeCharacters(g, mine);
	const [character, setCharacter] = useState(free[0]?.id ?? '');
	const [message, setMessage] = useState('');
	const [open, setOpen] = useState(false);
	const { busy, error, run } = useAction(reload);
	const myRequests = g.requests.filter((r) => r.mine);

	if (g.status !== 'approved' || (!free.length && !myRequests.length)) return null;
	return (
		<Panel title="Join" id="join">
			{myRequests.map((r) => (
				<p class="gp-row" key={r.id}>
					<span>
						<strong>{r.name}</strong> asked to join. Waiting for {g.name} to answer.
					</span>
					<button type="button" class="pf-button subtle" disabled={busy === r.id} onClick={() => run(r.id, () => removeMember(r.id))}>
						Withdraw
					</button>
				</p>
			))}
			{free.length > 0 &&
				(!g.recruiting ? (
					<p class="pf-empty">{g.name} isn’t recruiting right now.</p>
				) : !open ? (
					<p>
						<button type="button" class="pf-button primary" onClick={() => setOpen(true)}>
							Ask to join
						</button>
					</p>
				) : (
					<form
						class="pf-grid"
						onSubmit={async (e) => {
							e.preventDefault();
							if (await run('join', () => askToJoin(g.id, character, message))) {
								setOpen(false);
								setMessage('');
							}
						}}
					>
						<label class="pf-field">
							<span class="pf-label">Character</span>
							<select value={character} onChange={(e) => setCharacter(e.currentTarget.value)}>
								{free.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</label>
						<label class="pf-field pf-wide">
							<span class="pf-label">Message (optional)</span>
							<textarea rows={3} maxLength={500} value={message} onInput={(e) => setMessage(e.currentTarget.value)} />
						</label>
						<div class="gp-actions pf-wide">
							<button type="button" class="pf-button subtle" onClick={() => setOpen(false)}>
								Cancel
							</button>
							<button type="submit" class="pf-button primary" disabled={busy === 'join' || !character}>
								Send request
							</button>
						</div>
					</form>
				))}
			{error && <p class="portal-error">{error}</p>}
		</Panel>
	);
}

export function DutyPanel({ g, tiers, reload }: { g: Group; tiers: Tier[]; reload: () => Promise<void> }) {
	const mineHere = g.members.filter((m) => m.mine);
	const live = tiers.filter((t) => !t.retired);
	const [character, setCharacter] = useState(mineHere[0]?.character ?? '');
	const [tier, setTier] = useState(live[0]?.id ?? '');
	const [summary, setSummary] = useState('');
	const [link, setLink] = useState('');
	const [details, setDetails] = useState('');
	const [open, setOpen] = useState(false);
	const [sent, setSent] = useState(false);
	const { busy, error, run } = useAction(reload);

	if (g.kind !== 'agency' || g.status !== 'approved' || !mineHere.length) return null;
	const badLink = link.trim() !== '' && !/^https:\/\//.test(link.trim());
	return (
		<Panel title="Log a hero duty" id="log-duty">
			<p class="pf-intro">
				Played a scene where your hero helped out? Log it with a link to the RP. Once an admin approves it, {g.name} gets its points on the ranking for 30
				days.
			</p>
			{sent && <p class="gp-ok">Duty sent. It shows under Hero duties as Waiting until an admin reviews it.</p>}
			{!open ? (
				<p>
					<button type="button" class="pf-button primary" onClick={() => (setOpen(true), setSent(false))}>
						Log a duty
					</button>
				</p>
			) : (
				<form
					class="pf-grid"
					onSubmit={async (e) => {
						e.preventDefault();
						if (badLink) return;
						if (await run('duty', () => logDuty(g.id, character, tier, summary, details, link.trim()))) {
							setOpen(false);
							setSent(true);
							setSummary('');
							setLink('');
							setDetails('');
						}
					}}
				>
					{mineHere.length > 1 && (
						<label class="pf-field">
							<span class="pf-label">Character</span>
							<select value={character} onChange={(e) => setCharacter(e.currentTarget.value)}>
								{mineHere.map((m) => (
									<option key={m.id} value={m.character}>
										{m.name}
									</option>
								))}
							</select>
						</label>
					)}
					<label class="pf-field">
						<span class="pf-label">Kind of duty</span>
						<select value={tier} onChange={(e) => setTier(e.currentTarget.value)}>
							{live.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name} ({t.points} pt{t.points === 1 ? '' : 's'})
								</option>
							))}
						</select>
						<span class="pf-help">{live.find((t) => t.id === tier)?.description}</span>
					</label>
					<label class="pf-field pf-wide">
						<span class="pf-label">What happened</span>
						<input required maxLength={200} value={summary} placeholder="e.g. Stopped the Hosu bank robbery" onInput={(e) => setSummary(e.currentTarget.value)} />
					</label>
					<label class="pf-field pf-wide">
						<span class="pf-label">Link to the RP</span>
						<input required type="url" value={link} placeholder="https://discord.com/channels/…" onInput={(e) => setLink(e.currentTarget.value)} />
						{badLink && <span class="pf-help gp-bad">The link must start with https://</span>}
					</label>
					<label class="pf-field pf-wide">
						<span class="pf-label">Details (optional)</span>
						<textarea rows={3} maxLength={4000} value={details} onInput={(e) => setDetails(e.currentTarget.value)} />
					</label>
					<div class="gp-actions pf-wide">
						<button type="button" class="pf-button subtle" onClick={() => setOpen(false)}>
							Cancel
						</button>
						<button type="submit" class="pf-button primary" disabled={busy === 'duty' || badLink || !tier}>
							Send for review
						</button>
					</div>
				</form>
			)}
			{error && <p class="portal-error">{error}</p>}
		</Panel>
	);
}

function RankEditor({ g, reload }: { g: Group; reload: () => Promise<void> }) {
	const [draft, setDraft] = useState<Record<string, Rank>>({});
	const [added, setAdded] = useState('');
	const { busy, error, run } = useAction(reload);
	const rows = g.ranks.map((r) => draft[r.id] ?? r);
	const change = (r: Rank, patch: Partial<Rank>) => setDraft((d) => ({ ...d, [r.id]: { ...r, ...patch } }));
	const dirty = (r: Rank) => JSON.stringify(r) !== JSON.stringify(g.ranks.find((x) => x.id === r.id));
	const POWERS = [
		['manage', 'Members', 'Accept requests, move and remove members'],
		['spend', 'Wallet', 'Spend from the group wallet'],
		['edit', 'Page', 'Edit the group page'],
	] as const;

	return (
		<div class="gp-sub">
			<h3 class="gp-rank-title">Ranks</h3>
			<p class="pf-help">Ranks list from the lowest number to the highest. New members join the last plain rank. The leader rank always has every power.</p>
			<ul class="gp-ranks">
				{rows.map((r) => (
					<li key={r.id}>
						<input class="gp-rank-sort" type="number" min={r.leader ? 0 : 1} max={99} value={r.sort} disabled={r.leader} aria-label="Order"
							onInput={(e) => change(r, { sort: Number(e.currentTarget.value) || 1 })} />
						<input class="gp-rank-name" value={r.title} maxLength={40} aria-label="Rank title" onInput={(e) => change(r, { title: e.currentTarget.value })} />
						<span class="gp-powers">
							{POWERS.map(([key, label, title]) => (
								<label key={key} class="pf-check" title={title}>
									<input type="checkbox" checked={r.leader || r[key]} disabled={r.leader} onChange={(e) => change(r, { [key]: e.currentTarget.checked })} />
									{label}
								</label>
							))}
						</span>
						<span class="gp-rank-buttons">
							{dirty(r) && (
								<button type="button" class="pf-button primary" disabled={busy === r.id}
									onClick={async () => (await run(r.id, () => saveRank(g.id, r))) && setDraft((d) => (delete d[r.id], { ...d }))}>
									Save
								</button>
							)}
							{!r.leader && (
								<button type="button" class="pf-button subtle" disabled={busy === r.id}
									onClick={() => run(r.id, () => deleteRank(r.id), `Remove the rank “${r.title}”?`)}>
									Remove
								</button>
							)}
						</span>
					</li>
				))}
			</ul>
			<form
				class="gp-row"
				onSubmit={async (e) => {
					e.preventDefault();
					const sort = Math.max(...g.ranks.map((r) => r.sort)) + 1;
					if (await run('add', () => saveRank(g.id, { title: added.trim(), sort }))) setAdded('');
				}}
			>
				<span class="pf-field gp-grow">
					<input value={added} maxLength={40} placeholder="New rank title" aria-label="New rank title" onInput={(e) => setAdded(e.currentTarget.value)} />
				</span>
				<button type="submit" class="pf-button" disabled={!added.trim() || busy === 'add'}>
					Add rank
				</button>
			</form>
			{error && <p class="portal-error">{error}</p>}
		</div>
	);
}

export function ManagePanel({ g, reload }: { g: Group; reload: () => Promise<void> }) {
	const { busy, error, run } = useAction(reload);
	const leaderRank = g.ranks.find((r) => r.leader);
	const plainRank = (r: Rank | undefined) => r && !r.leader && !r.manage && !r.spend && !r.edit;
	const [heir, setHeir] = useState('');
	const others = g.members.filter((m) => m.rank !== leaderRank?.id);

	if (!(g.me.manage || g.me.edit || g.is_requester)) return null;
	return (
		<Panel title="Manage" id="manage">
			<p class="gp-row">
				{(g.me.edit || g.is_requester) && (
					<a class="pf-button" href={newGroupHref(g.slug)}>
						Edit page
					</a>
				)}
				{g.status !== 'approved' && g.is_requester && (
					<button type="button" class="pf-button subtle" disabled={busy === 'delete'}
						onClick={async () => (await run('delete', () => deleteGroup(g.id), `Withdraw the request for ${g.name}? This deletes it.`)) && (location.href = mineHref())}>
						Withdraw request
					</button>
				)}
			</p>

			{g.me.manage && g.status === 'approved' && (
				<>
					<div class="gp-sub">
						<h3 class="gp-rank-title">Join requests</h3>
						{g.requests.length === 0 ? (
							<p class="pf-empty">No one is waiting.</p>
						) : (
							<ul class="gp-list">
								{g.requests.map((r) => (
									<li key={r.id}>
										<span class="gp-list-main">
											<strong>{r.name}</strong>
											<span class="gp-list-sub">
												{r.player}
												{r.message && ` · “${r.message}”`}
											</span>
										</span>
										<span class="gp-rank-buttons">
											<button type="button" class="pf-button primary" disabled={busy === r.id} onClick={() => run(r.id, () => respondJoin(r.id, true))}>
												Accept
											</button>
											<button type="button" class="pf-button subtle" disabled={busy === r.id} onClick={() => run(r.id, () => respondJoin(r.id, false))}>
												Decline
											</button>
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					<div class="gp-sub">
						<h3 class="gp-rank-title">Members</h3>
						<ul class="gp-list">
							{others.map((m) => {
								const rank = g.ranks.find((r) => r.id === m.rank);
								// Only the leader moves members into or out of ranks with powers.
								const choices = g.ranks.filter((r) => !r.leader && (g.me.leader || plainRank(r)));
								const locked = !g.me.leader && !plainRank(rank);
								return (
									<li key={m.id}>
										<span class="gp-list-main">
											<strong>{m.name}</strong>
											<span class="gp-list-sub">{m.player}</span>
										</span>
										<span class="pf-field gp-member-rank">
											<select value={m.rank} disabled={locked || busy === m.id} aria-label={`Rank of ${m.name}`}
												onChange={(e) => run(m.id, () => setRank(m.id, e.currentTarget.value))}>
												{(locked ? [rank!] : choices).map((r) => (
													<option key={r.id} value={r.id}>
														{r.title}
													</option>
												))}
											</select>
										</span>
										{!locked && !m.mine && (
											<button type="button" class="pf-button subtle" disabled={busy === m.id}
												onClick={() => run(m.id, () => removeMember(m.id), `Remove ${m.name} from ${g.name}?`)}>
												Remove
											</button>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				</>
			)}

			{g.me.leader && <RankEditor g={g} reload={reload} />}

			{g.me.leader && others.length > 0 && (
				<div class="gp-sub">
					<h3 class="gp-rank-title">Hand over leadership</h3>
					<p class="pf-help">The new leader takes the {leaderRank?.title} rank; the current leader takes theirs.</p>
					<p class="gp-row">
						<span class="pf-field gp-grow">
							<select value={heir} onChange={(e) => setHeir(e.currentTarget.value)} aria-label="New leader">
								<option value="">Pick a member…</option>
								{others.map((m) => (
									<option key={m.id} value={m.id}>
										{m.name}
									</option>
								))}
							</select>
						</span>
						<button type="button" class="pf-button" disabled={!heir || busy === 'heir'}
							onClick={() => run('heir', () => transferLeader(g.id, heir), `Make ${others.find((m) => m.id === heir)?.name} the leader of ${g.name}?`)}>
							Hand over
						</button>
					</p>
				</div>
			)}
			{error && <p class="portal-error">{error}</p>}
		</Panel>
	);
}
