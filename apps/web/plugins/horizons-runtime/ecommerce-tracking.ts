import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_PATH = path.resolve(PLUGIN_DIR, 'ecommerce-tracking-runtime.js');
const GOOGLE_CONSENT_BOOTSTRAP_PATH = path.resolve(PLUGIN_DIR, 'google-consent-bootstrap.js');
const GOOGLE_ANALYTICS_ID_PATTERN = /^G-[\dA-Z]{1,30}$/;
const META_PIXEL_ID_PATTERN = /^\d{1,30}$/;

const readTrackingId = (value: string | undefined, pattern: RegExp) => (value && pattern.test(value) ? value : null);

type TrackingConfig = { googleAnalyticsId: string | null; metaPixelId: string | null };

function readTrackingConfig(): TrackingConfig | null {
	if (process.env.NODE_ENV !== 'production') {
		return null;
	}

	return {
		googleAnalyticsId: readTrackingId(process.env.ECOMMERCE_GA_ID, GOOGLE_ANALYTICS_ID_PATTERN),
		metaPixelId: readTrackingId(process.env.ECOMMERCE_META_PIXEL_ID, META_PIXEL_ID_PATTERN),
	};
}

const toConfigAssignment = (config: TrackingConfig) => `window.__HORIZONS_ECOMMERCE_TRACKING__ = ${JSON.stringify(config)};`;

export function getEcommerceTrackingScript(): string | null {
	const config = readTrackingConfig();

	if (!config || (!config.googleAnalyticsId && !config.metaPixelId)) {
		return null;
	}

	return `${toConfigAssignment(config)}\n${readFileSync(RUNTIME_PATH, 'utf-8')}`;
}

/** Consent defaults and the gtag.js tag, served in the HTML head so Google's tag check can find them. */
export function getGoogleTag(): { inlineScript: string; src: string } | null {
	const config = readTrackingConfig();

	if (!config?.googleAnalyticsId) {
		return null;
	}

	return {
		inlineScript: `${toConfigAssignment(config)}\n${readFileSync(GOOGLE_CONSENT_BOOTSTRAP_PATH, 'utf-8')}`,
		src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.googleAnalyticsId)}`,
	};
}
