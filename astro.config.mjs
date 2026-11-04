import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';

// Singularity Orgs: Organizations, Corporations and Hero Agencies, plus the Hero Agency Ranking.
// Its rules live on the Singularity Index (https://index.singularityeco.us/).
export default defineConfig({
	site: 'https://orgs.singularityeco.us',
	integrations: [
		preact(),
		starlight({
			title: 'Singularity Orgs',
			logo: { src: './src/assets/singularity-logo.webp' },
			favicon: '/favicon.png',
			pagefind: false,
			tableOfContents: false,
			pagination: false,
			customCss: ['@fontsource-variable/exo-2', './src/styles/site.css', './src/styles/orgs.css'],
		}),
	],
});
