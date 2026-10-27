(() => {
	const config = window.__HORIZONS_ECOMMERCE_TRACKING__ || {};
	const CONSENT_COOKIE = 'cc_cookie';
	const CONSENT_EVENT = 'cc:onConsent';
	const CONSENT_CHANGE_EVENT = 'cc:onChange';
	const LAST_PURCHASE_COOKIE = 'last_purchase';
	const LOGGED_PURCHASE_STORAGE_KEY = 'horizons_logged_purchase_transaction_id';
	const PIXEL_STANDARD_EVENTS = {
		view_item: 'ViewContent',
		add_to_cart: 'AddToCart',
		begin_checkout: 'InitiateCheckout',
		purchase: 'Purchase',
	};
	const PIXEL_CUSTOM_EVENTS = {
		select_item: 'SelectItem',
		view_cart: 'ViewCart',
		remove_from_cart: 'RemoveFromCart',
	};

	const pendingPixelEvents = [];
	let isMetaPixelLoaded = false;
	let consent = null;

	const readCookie = (name) => {
		const prefix = `${name}=`;
		const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));

		return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
	};

	const deleteCookie = (name) => {
		const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

		document.cookie = expired;
		document.cookie = `${expired}; domain=${window.location.hostname}`;
	};

	const readConsentCategories = () => {
		try {
			const value = readCookie(CONSENT_COOKIE);
			const categories = value ? JSON.parse(value).categories : null;

			return Array.isArray(categories) ? categories : null;
		} catch {
			return null;
		}
	};

	const loadScript = (src) => {
		const script = document.createElement('script');

		script.async = true;
		script.src = src;
		document.head.appendChild(script);
	};

	const loadMetaPixel = (pixelId) => {
		if (!window.fbq) {
			const fbq = function fbq() {
				if (fbq.callMethod) {
					fbq.callMethod.apply(fbq, arguments);
				} else {
					fbq.queue.push(arguments);
				}
			};

			fbq.push = fbq;
			fbq.loaded = true;
			fbq.version = '2.0';
			fbq.queue = [];
			window.fbq = fbq;
			window._fbq = window._fbq || fbq;
			loadScript('https://connect.facebook.net/en_US/fbevents.js');
		}

		window.fbq('init', pixelId);
		window.fbq('track', 'PageView');
	};

	const toPixelPayload = (eventName, payload) => {
		const items = payload.items || [];

		return {
			content_type: 'product',
			currency: payload.currency,
			value: payload.value,
			content_ids: items.map((item) => String(item.item_id)),
			contents: items.map((item) => ({
				id: String(item.item_id),
				quantity: item.quantity,
				item_price: item.price,
			})),
			num_items: items.reduce((total, item) => total + (item.quantity || 0), 0),
			...(eventName === 'purchase' && {
				order_id: payload.transaction_id,
				shipping: payload.shipping,
				tax: payload.tax,
			}),
		};
	};

	const sendToMetaPixel = (eventName, payload) => {
		const standardEvent = PIXEL_STANDARD_EVENTS[eventName];
		const customEvent = PIXEL_CUSTOM_EVENTS[eventName];
		const pixelPayload = toPixelPayload(eventName, payload);
		const options = eventName === 'purchase' && payload.transaction_id ? { eventID: payload.transaction_id } : undefined;

		if (standardEvent) {
			window.fbq('track', standardEvent, pixelPayload, options);
		} else if (customEvent) {
			window.fbq('trackCustom', customEvent, pixelPayload);
		}
	};

	// Google Analytics gets every event at once: its consent state, set in the page head, decides what it may store.
	const track = (eventName, payload) => {
		if (config.googleAnalyticsId && window.gtag) {
			window.gtag('event', eventName, payload);
		}

		if (!config.metaPixelId) {
			return;
		}

		if (!consent) {
			pendingPixelEvents.push([eventName, payload]);
		} else if (consent.marketing) {
			sendToMetaPixel(eventName, payload);
		}
	};

	const trackLastPurchase = () => {
		const value = readCookie(LAST_PURCHASE_COOKIE);

		if (!value) {
			return;
		}

		deleteCookie(LAST_PURCHASE_COOKIE);

		try {
			const purchase = JSON.parse(value);

			if (!purchase.transaction_id || localStorage.getItem(LOGGED_PURCHASE_STORAGE_KEY) === purchase.transaction_id) {
				return;
			}

			localStorage.setItem(LOGGED_PURCHASE_STORAGE_KEY, purchase.transaction_id);
			track('purchase', {
				transaction_id: purchase.transaction_id,
				value: purchase.value,
				currency: purchase.currency,
				shipping: purchase.shipping,
				tax: purchase.tax,
				...(purchase.coupon && { coupon: purchase.coupon }),
				items: (purchase.items || []).map((item) => ({
					item_id: item.id,
					item_name: item.title,
					...(item.variantTitle && { item_variant: item.variantTitle }),
					price: item.price,
					quantity: item.quantity,
				})),
			});
		} catch {
			// A malformed cookie cannot be reported; dropping it keeps later purchases flowing.
		}
	};

	const applyConsent = (categories) => {
		const isFirstDecision = !consent;

		consent = { marketing: categories.includes('marketing') };

		if (consent.marketing && config.metaPixelId && !isMetaPixelLoaded) {
			isMetaPixelLoaded = true;
			loadMetaPixel(config.metaPixelId);
		}

		const pending = isFirstDecision ? pendingPixelEvents.splice(0) : [];

		if (consent.marketing) {
			pending.forEach(([eventName, payload]) => sendToMetaPixel(eventName, payload));
		}
	};

	const init = () => {
		const categories = readConsentCategories();
		const applyStoredConsent = () => applyConsent(readConsentCategories() || []);

		window.addEventListener(CONSENT_CHANGE_EVENT, applyStoredConsent);

		if (categories) {
			applyConsent(categories);
		} else {
			window.addEventListener(CONSENT_EVENT, applyStoredConsent, { once: true });
		}
	};

	window.horizonsEcommerceTracking = { track };
	trackLastPurchase();

	if (document.readyState === 'complete') {
		init();
	} else {
		window.addEventListener('load', init, { once: true });
	}
})();
