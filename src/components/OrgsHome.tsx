// Singularity Orgs home: what kinds of group there are, the Hero Agency Ranking, and your groups.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { logIn, loginErrorFromUrl, siteConfigured, watchPlayer, type Player } from '../lib/supabase.ts';

const root = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const messageOf = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e));

// Small line icons, drawn in the accent colour.
const ICONS = {
	organization: 'M12 3 3 7.5l9 4.5 9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5 12 21l9-4.5',
	corporation: 'M4 21V5l8-2v18M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01M2 21h20',
	agency: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4',
	ranking: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3',
};

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
	<svg class="og-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
		<path d={ICONS[name]} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
);

function Tile(props: { icon: keyof typeof ICONS; title: string; text: string; href?: string; badge?: string; children?: ComponentChildren }) {
	return (
		<article class={`og-tile${props.href ? ' linked' : ''}`}>
			<Icon name={props.icon} />
			<h3>{props.href ? <a href={props.href}>{props.title}</a> : props.title}</h3>
			{props.badge && <span class="og-badge">{props.badge}</span>}
			<p>{props.text}</p>
			{props.children}
		</article>
	);
}

function Tiles() {
	return (
		<div class="og-tiles">
			<Tile
				icon="organization"
				title="Organizations"
				href={`${root}groups/?type=organization`}
				text="Guilds, gangs, orders and secret societies. Characters band together under one banner."
			/>
			<Tile
				icon="corporation"
				title="Corporations"
				href={`${root}groups/?type=corporation`}
				text="Businesses with a shared wallet and their own shop in the economy."
			/>
			<Tile
				icon="agency"
				title="Hero Agencies"
				href={`${root}groups/?type=agency`}
				text="Licensed hero teams. Every hero duty their members perform earns the agency points."
			/>
			<Tile icon="ranking" title="Hero Agency Ranking" href={`${root}ranking/`} text="The official chart of the top hero agencies, sorted by points." />
		</div>
	);
}

export default function OrgsHome() {
	const [player, setPlayer] = useState<Player | null | undefined>(siteConfigured ? undefined : null);
	const [error, setError] = useState(() => {
		const urlError = loginErrorFromUrl();
		if (urlError) return `Discord login didn't finish: ${urlError}`;
		return siteConfigured ? '' : 'The site is not connected to its database yet (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are missing from this build).';
	});

	useEffect(() => (siteConfigured ? watchPlayer((p, e) => (e ? setError(`Couldn't load your account: ${messageOf(e)}`) : setPlayer(p))) : undefined), []);

	const errorBox = error ? <p class="portal-error">{error}</p> : null;
	if (player === undefined) return <p class="portal-status">Checking your login…</p>;

	return (
		<div class="og-home">
			{errorBox}
			<section class="og-hero">
				{player ? (
					<h2 class="og-welcome">Welcome back, {player.displayName}</h2>
				) : (
					<>
						<p class="og-lead">
							Every Organization, Corporation and Hero Agency in Singularity lives here: who leads them, who belongs, what they own, and which agencies top
							the hero chart.
						</p>
						<button type="button" class="portal-button discord" disabled={!siteConfigured} onClick={() => logIn().catch((e) => setError(messageOf(e)))}>
							Log in with Discord
						</button>
					</>
				)}
			</section>
			<h2 class="og-heading">Browse</h2>
			<Tiles />
			{player && (
				<>
					<h2 class="og-heading">My Groups</h2>
					<section class="portal-card">
						<p class="pf-empty">Your characters aren't in any groups yet. Open a group's page to ask to join, or request a new group.</p>
					</section>
				</>
			)}
		</div>
	);
}
