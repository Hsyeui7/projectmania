/**
 * Builds the tags an indexable page needs — title, description, canonical URL,
 * Open Graph, X/Twitter card, and any JSON-LD — from one call in the route's
 * `meta` export.
 *
 * Canonical and `og:url` have to be absolute, and only the server knows the
 * site's public origin, so the root route publishes it and this reads it back
 * out of `matches`. A page that writes `<meta>` tags by hand instead ends up
 * with no canonical URL and nothing for social platforms to show.
 *
 * X falls back to the `og:` tags, so the `twitter:` ones repeat them only
 * because SEO audits score the card tags on their own.
 */
import type { MetaDescriptor } from 'react-router';

type RouteMatchLike = { id: string; loaderData: unknown } | undefined;

export type SeoArgs = {
	matches: readonly RouteMatchLike[];
	location: { pathname: string };
};

export type SeoInput = {
	/** Unique to this page, under ~60 characters. */
	title: string;
	/** Unique to this page, 120-160 characters. */
	description: string;
	/** Canonical path, when it differs from the URL being rendered. */
	path?: string;
	/** Social card image, absolute or root-relative. */
	image?: string;
	/** `article` for blog posts and news, `website` for everything else. */
	type?: 'website' | 'article';
	/**
	 * Keeps the page out of search results while still letting crawlers follow
	 * its links. Not access control. Add `nofollow` as an extra descriptor when
	 * a page genuinely needs it.
	 */
	noindex?: boolean;
	/** Schema.org objects, one `<script type="application/ld+json">` each. */
	jsonLd?: object | object[];
};

const ROOT_ROUTE_ID = 'root';

/** The site's public origin, as published by the root loader. */
export const siteOriginFrom = (matches: readonly RouteMatchLike[]): string => {
	const root = matches.find(match => match?.id === ROOT_ROUTE_ID);

	return (root?.loaderData as { origin?: string } | undefined)?.origin ?? '';
};

export const absoluteUrl = (origin: string, target: string): string => {
	if (/^https?:\/\//.test(target)) {
		return target;
	}

	return `${origin}${target.startsWith('/') ? target : `/${target}`}`;
};

export function seo({ matches, location }: SeoArgs, input: SeoInput): MetaDescriptor[] {
	const origin = siteOriginFrom(matches);
	const canonical = absoluteUrl(origin, input.path ?? location.pathname);
	const imageUrl = input.image ? absoluteUrl(origin, input.image) : '';

	const tags: MetaDescriptor[] = [
		{ title: input.title },
		{ name: 'description', content: input.description },
		{ property: 'og:title', content: input.title },
		{ property: 'og:description', content: input.description },
		{ property: 'og:type', content: input.type ?? 'website' },
		{ name: 'twitter:card', content: imageUrl ? 'summary_large_image' : 'summary' },
		{ name: 'twitter:title', content: input.title },
		{ name: 'twitter:description', content: input.description },
	];

	if (origin) {
		tags.push({ tagName: 'link', rel: 'canonical', href: canonical }, { property: 'og:url', content: canonical });
	}

	if (imageUrl) {
		tags.push({ property: 'og:image', content: imageUrl }, { name: 'twitter:image', content: imageUrl });
	}

	if (input.noindex) {
		tags.push({ name: 'robots', content: 'noindex' });
	}

	for (const block of [input.jsonLd ?? []].flat()) {
		tags.push({ 'script:ld+json': block });
	}

	return tags;
}
