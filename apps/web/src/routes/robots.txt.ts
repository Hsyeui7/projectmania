import type { Route } from './+types/robots.txt';
import { siteOrigin } from '@/lib/site-origin.server';

/**
 * Hostinger-provided hosts: the editor sandbox preview, and the domain a site is
 * published on before its owner connects one of their own. Neither should reach a
 * search index — the site is not on its final URL yet.
 */
const UNPUBLISHED_HOST_SUFFIXES = [
	'.app-preview.com',
	'.app-preview.io',
	'.hostingersite.com',
	'.hostingersite.dev',
];

/**
 * The assistants and answer engines that fetch a page to answer someone's
 * question and cite the site back. They are listed by name, rather than left to
 * the wildcard group, so the site's stance on AI access is explicit to anyone —
 * or anything — reading the file.
 *
 * Each vendor splits the work the same way: one crawler builds the index the
 * answers are drawn from, another fetches the single page a person just asked
 * about. Meta and Amazon both document that second kind as free to skip
 * robots.txt, since a human asked for the page — naming them records the site's
 * answer, it does not enforce it.
 */
const AI_ANSWER_AGENTS = [
	'OAI-SearchBot',
	'ChatGPT-User',
	'Claude-SearchBot',
	'Claude-User',
	'PerplexityBot',
	'Perplexity-User',
	'DuckAssistBot',
	'MistralAI-User',
	'meta-webindexer',
	'meta-externalfetcher',
	'Amzn-SearchBot',
	'Amzn-User',
];

/**
 * Tokens whose meaning is permission to train generative models on the content.
 * `Google-Extended` and `Applebot-Extended` are not crawlers and never fetch
 * anything — they read robots.txt as a usage licence, so `Disallow: /` is the
 * only way to express `ai-train=no` to them. The rest are the crawlers that
 * collect training corpora. Most have an answer-engine counterpart above that
 * keeps the site citable in exchange; `Bytespider` is last because ByteDance
 * runs no answer engine to trade the access for.
 *
 * Blocking `Google-Extended` also gives up grounding in the Gemini app. Google
 * Search, and the AI Overviews built from its index, are unaffected, and
 * `Applebot-Extended` works the same way for Siri and Spotlight. `Googlebot`
 * and `Applebot` themselves keep their access through the wildcard group, which
 * is why neither is named above.
 */
const AI_TRAINING_AGENTS = [
	'GPTBot',
	'ClaudeBot',
	'Google-Extended',
	'Applebot-Extended',
	'meta-externalagent',
	'Amazonbot',
	'Bytespider',
];

/**
 * Content signals (contentsignals.org) state what crawlers may do with the
 * content once fetched: appear in search results, ground an AI answer, or train
 * a model. Search and AI answers are allowed because they bring readers back;
 * training is not, which is the default every publisher starts from.
 *
 * A named group replaces the wildcard group for that agent rather than adding
 * to it, so the signal is repeated inside each one — otherwise the agents it is
 * aimed at are the only ones that never read it.
 */
const CONTENT_SIGNAL = 'Content-Signal: search=yes, ai-input=yes, ai-train=no';

function publishedRules(origin: string): string[] {
	return [
		'User-agent: *',
		CONTENT_SIGNAL,
		'Allow: /',
		'',
		...AI_ANSWER_AGENTS.flatMap(agent => [`User-agent: ${agent}`, CONTENT_SIGNAL, 'Allow: /', '']),
		...AI_TRAINING_AGENTS.flatMap(agent => [`User-agent: ${agent}`, 'Disallow: /', '']),
		`Sitemap: ${origin}/sitemap.xml`,
	];
}

export function loader({ request }: Route.LoaderArgs) {
	const origin = siteOrigin(request);
	const { hostname } = new URL(origin);
	const isUnpublished = UNPUBLISHED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
	const lines = isUnpublished
		? ['User-agent: *', 'Disallow: /']
		: publishedRules(origin);

	return new Response(`${lines.join('\n')}\n`, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
