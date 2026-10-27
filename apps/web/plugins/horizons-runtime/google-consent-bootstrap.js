(() => {
	const measurementId = (window.__HORIZONS_ECOMMERCE_TRACKING__ || {}).googleAnalyticsId;

	if (!measurementId) {
		return;
	}

	const CONSENT_COOKIE = 'cc_cookie';
	const CONSENT_EVENT = 'cc:onConsent';
	const CONSENT_CHANGE_EVENT = 'cc:onChange';

	const readConsentCategories = () => {
		const prefix = `${CONSENT_COOKIE}=`;
		const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));

		try {
			const categories = entry ? JSON.parse(decodeURIComponent(entry.slice(prefix.length))).categories : null;

			return Array.isArray(categories) ? categories : null;
		} catch {
			return null;
		}
	};

	const toGoogleConsent = (categories) => {
		const analytics = categories.includes('analytics') ? 'granted' : 'denied';
		const ads = categories.includes('marketing') ? 'granted' : 'denied';

		return {
			analytics_storage: analytics,
			ad_storage: ads,
			ad_user_data: ads,
			ad_personalization: ads,
		};
	};

	const updateConsent = () => window.gtag('consent', 'update', toGoogleConsent(readConsentCategories() || []));

	window.dataLayer = window.dataLayer || [];
	window.gtag = window.gtag || function gtag() {
		window.dataLayer.push(arguments);
	};

	// Consent Mode v2 (advanced): the tag always loads, cookieless until the visitor grants a category.
	window.gtag('consent', 'default', toGoogleConsent([]));
	window.gtag('set', 'ads_data_redaction', true);

	if (readConsentCategories()) {
		updateConsent();
	}

	window.addEventListener(CONSENT_EVENT, updateConsent);
	window.addEventListener(CONSENT_CHANGE_EVENT, updateConsent);
	window.gtag('js', new Date());
	window.gtag('config', measurementId);
})();
