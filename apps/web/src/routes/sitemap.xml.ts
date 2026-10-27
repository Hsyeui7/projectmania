import type { Route } from './+types/sitemap.xml';
import { siteOrigin } from '@/lib/site-origin.server';

type SitemapEntry = {
	path: string;
	lastmod?: string;
};

const STATIC_PATHS = ['/', '/projects', '/category/0', '/category/1', '/category/2', '/category/3', '/about', '/contact', '/faqs', '/privacy', '/terms', '/refund'];

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function toLoc(origin: string, path: string): string {
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function serializeSitemap(origin: string, entries: SitemapEntry[]): string {
	const urls = entries
		.map(entry => {
			const loc = escapeXml(toLoc(origin, entry.path));
			const lastmod = entry.lastmod
				? `\n\t\t<lastmod>${escapeXml(entry.lastmod)}</lastmod>`
				: '';

			return `\t<url>\n\t\t<loc>${loc}</loc>${lastmod}\n\t</url>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Public dynamic URLs (blog posts, PDPs, articles).
 * Return `{ path, lastmod }` in the same change that adds a collection.
 * Return `[]` only while the site has no public records; clear those URLs
 * again in the same change that removes the collection.
 */
async function getDynamicEntries(): Promise<SitemapEntry[]> {
 const entries: SitemapEntry[] = [];
 for(let page=1;;page++){
 const response=await fetch(`${process.env.POCKETBASE_URL || 'http://localhost:8090'}/api/collections/projects/records?page=${page}&perPage=100`);
 if(!response.ok) break;
 const result=await response.json() as {items:{id:string;updated:string}[];totalPages:number};
 entries.push(...result.items.map(p=>({path:'/project/'+p.id,lastmod:p.updated.replace(' ','T')})));
 if(page>=result.totalPages)break;
 }
 return entries;
}

export async function loader({ request }: Route.LoaderArgs) {
	const origin = siteOrigin(request);
	const entries: SitemapEntry[] = [
		...STATIC_PATHS.map(path => ({ path })),
		...(await getDynamicEntries()),
	];

	return new Response(serializeSitemap(origin, entries), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
			'Access-Control-Allow-Origin': '*',
		},
	});
}
