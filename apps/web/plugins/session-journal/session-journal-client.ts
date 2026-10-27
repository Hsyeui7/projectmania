import { postToParent } from '../visual-editor/utils/parent-frame.js';

const EVENT = 'sessionJournalEvents';
const MAX_TEXT = 2000;
const MAX_BATCH = 50;
// Errors must land before the AI reads the journal after a reload, and the page load tells it the app
// is up so it can stop waiting; the rest is batched to limit backend writes.
const FAST_FLUSH_MS = 1000;
const FLUSH_INTERVAL_MS = 10000;
const FAST_FLUSH_KINDS = new Set(['load', 'console.error', 'window.error', 'unhandledrejection', 'root.empty', 'network.error']);

const enabled = window.parent !== window;

let queue: any[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushAt = Infinity;

function flushQueue() {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	flushAt = Infinity;
	if (!queue.length) {
		return;
	}
	const pending = queue;
	queue = [];
	for (let i = 0; i < pending.length; i += MAX_BATCH) {
		postToParent(EVENT, { events: pending.slice(i, i + MAX_BATCH) });
	}
}

function scheduleFlush(delayMs: number) {
	const at = Date.now() + delayMs;
	if (at >= flushAt) {
		return;
	}
	if (flushTimer) {
		clearTimeout(flushTimer);
	}
	flushAt = at;
	flushTimer = setTimeout(flushQueue, delayMs);
}

function send(kind, data) {
	if (!enabled) {
		return;
	}
	queue.push({ kind, t: Date.now(), ...data });
	if (queue.length >= MAX_BATCH) {
		flushQueue();
	} else {
		scheduleFlush(FAST_FLUSH_KINDS.has(kind) ? FAST_FLUSH_MS : FLUSH_INTERVAL_MS);
	}
}

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'hidden') {
		flushQueue();
	}
});
window.addEventListener('pagehide', flushQueue);

function truncate(value) {
	if (value == null) {
		return '';
	}
	const s = String(value);
	return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '...' : s;
}

function isSensitiveName(name) {
	return /password|secret|token|apikey|key|auth|credential|cookie/i.test(String(name || ''));
}

function sanitizeUrl(value) {
	try {
		const url = new URL(String(value), location.href);
		for (const key of [...url.searchParams.keys()]) {
			if (isSensitiveName(key)) {
				url.searchParams.set(key, '[redacted]');
			}
		}
		return truncate(url.toString());
	} catch {
		return truncate(value);
	}
}

function summarizeValue(name, value) {
	if (isSensitiveName(name)) {
		const length = value == null ? 0 : String(value).length;
		return '[redacted:length=' + length + ']';
	}
	if (Array.isArray(value)) {
		return value.map((item) => summarizeValue(name, item));
	}
	if (value && typeof value === 'object') {
		return summarizeObject(value);
	}
	return truncate(value);
}

function summarizeObject(value) {
	const out = {};
	for (const [key, val] of Object.entries(value || {})) {
		out[key] = summarizeValue(key, val);
	}
	return out;
}

function summarizeRequestBody(body) {
	if (body == null) {
		return null;
	}
	if (body instanceof FormData) {
		const out = {};
		for (const [key, val] of body.entries()) {
			out[key] = val instanceof File
				? { fileName: truncate(val.name), type: val.type || null, size: val.size }
				: summarizeValue(key, val);
		}
		return out;
	}
	if (body instanceof URLSearchParams) {
		const out = {};
		for (const [key, val] of body.entries()) out[key] = summarizeValue(key, val);
		return out;
	}
	if (typeof body === 'string') {
		try {
			return summarizeObject(JSON.parse(body));
		} catch {
			return truncate(body);
		}
	}
	if (body && typeof body === 'object' && body.constructor === Object) {
		return summarizeObject(body);
	}
	return '[' + Object.prototype.toString.call(body).slice(8, -1) + ' body]';
}

function isSensitive(el) {
	if (!el) {
		return false;
	}
	if (el.type === 'password') {
		return true;
	}
	return isSensitiveName(el.name || el.id || el.getAttribute('autocomplete') || '');
}

function compactText(value) {
	return truncate(String(value || '').replace(/\s+/g, ' ').trim());
}

function labelFromLabelledBy(el) {
	const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
	if (!ids.length) {
		return '';
	}
	const parts = ids
		.map((id) => document.getElementById(id))
		.filter(Boolean)
		.map((node) => compactText(node.textContent));
	return parts.filter(Boolean).join(' ');
}

function labelFromForAttr(el) {
	if (!el.id) {
		return '';
	}
	try {
		const escapedId = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id;
		const labelEl = document.querySelector('label[for="' + escapedId + '"]');
		return labelEl ? compactText(labelEl.textContent) : '';
	} catch {
		return '';
	}
}

function labelFromWrappingLabel(el) {
	let cur = el.parentElement;
	for (let i = 0; i < 4 && cur; i++) {
		if (cur.tagName === 'LABEL') {
			const clone = cur.cloneNode(true);
			for (const inner of clone.querySelectorAll('input, textarea, select')) {
				inner.remove();
			}
			return compactText(clone.textContent);
		}
		cur = cur.parentElement;
	}
	return '';
}

function fieldLabel(el) {
	if (!el || el.nodeType !== 1) {
		return null;
	}
	const sources = [
		el.getAttribute('name'),
		labelFromLabelledBy(el),
		el.getAttribute('aria-label'),
		labelFromForAttr(el),
		labelFromWrappingLabel(el),
		el.id,
		el.getAttribute('placeholder'),
	];
	for (const candidate of sources) {
		const trimmed = candidate ? String(candidate).trim() : '';
		if (trimmed) {
			return compactText(trimmed);
		}
	}
	const type = (el.getAttribute('type') || el.tagName || '').toLowerCase();
	return type ? '[' + type + ']' : null;
}

function fieldValue(el) {
	if (!el || !('value' in el)) {
		return { value: '', length: 0, redacted: false };
	}
	const raw = el.value == null ? '' : String(el.value);
	if (isSensitive(el)) {
		return { value: '[redacted:length=' + raw.length + ']', length: raw.length, redacted: true };
	}
	return { value: truncate(raw), length: raw.length, redacted: false };
}

function describeElement(el) {
	if (!el || el.nodeType !== 1) {
		return null;
	}
	const tag = el.tagName.toLowerCase();
	const role = el.getAttribute('role') || null;
	const ariaLabel = el.getAttribute('aria-label') || null;
	const name = el.getAttribute('name') || null;
	const type = el.getAttribute('type') || null;
	const id = el.id || null;
	const placeholder = el.getAttribute('placeholder') || null;
	const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
	const valueInfo = isInput ? fieldValue(el) : null;
	const text = isSensitive(el) ? '' : truncate(el.textContent || '');
	return {
		tag,
		role,
		ariaLabel,
		name,
		type,
		id,
		placeholder,
		label: isInput ? fieldLabel(el) : null,
		value: valueInfo ? valueInfo.value : null,
		valueLength: valueInfo ? valueInfo.length : 0,
		text,
	};
}

function findInteractive(el) {
	let cur = el;
	for (let i = 0; i < 6 && cur; i++) {
		if (cur.nodeType !== 1) { cur = cur.parentNode; continue; }
		const tag = cur.tagName;
		if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
				tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL' ||
				cur.hasAttribute('role') || cur.hasAttribute('onclick')) {
			return cur;
		}
		cur = cur.parentNode;
	}
	return el;
}

document.addEventListener('click', (e) => {
	send('click', { element: describeElement(findInteractive(e.target)) });
}, true);

document.addEventListener('submit', (e) => {
	const form = e.target as any;
	const fields: any[] = [];
	if (form && form.elements) {
		for (const el of form.elements) {
			const label = fieldLabel(el);
			if (!label || !('value' in el)) {
				continue;
			}
			const v = fieldValue(el);
			fields.push({
				label,
				type: el.type || el.tagName.toLowerCase(),
				value: v.value,
				length: v.length,
				redacted: v.redacted,
			});
		}
	}
	send('submit', { formId: form.id || null, action: form.action || null, fields });
}, true);

document.addEventListener('focus', (e) => {
	const target = e.target as any;
	if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
		return;
	}
	send('focus', { element: describeElement(target) });
}, true);

document.addEventListener('change', (e) => {
	const target = e.target as any;
	if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
		return;
	}
	if (target.type === 'file') {
		return;
	}
	send('change', { element: describeElement(target) });
}, true);

document.addEventListener('blur', (e) => {
	const target = e.target as any;
	if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
		return;
	}
	if (!('value' in target) || !target.value) {
		return;
	}
	send('blur', { element: describeElement(target) });
}, true);

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
	const started = performance.now();
	const url = typeof input === 'string' ? input : (input as any)?.url;
	const method = (init?.method || (input as any)?.method || 'GET').toUpperCase();
	const requestBody = summarizeRequestBody(init?.body);
	try {
		const response = await nativeFetch(input, init);
		const requestUrl = url || response.url;
		if (!response.ok) {
			let body = '';
			try { body = await response.clone().text(); } catch {}
			send('network.error', {
				method,
				url: sanitizeUrl(requestUrl),
				status: response.status,
				statusText: response.statusText,
				requestBody,
				response: truncate(body),
				durationMs: Math.round(performance.now() - started),
			});
		}
		return response;
	} catch (err) {
		send('network.error', {
			method,
			url: sanitizeUrl(url || ''),
			requestBody,
			message: truncate(err && err.message ? err.message : String(err)),
			durationMs: Math.round(performance.now() - started),
		});
		throw err;
	}
};

const NativeXMLHttpRequest = window.XMLHttpRequest;
window.XMLHttpRequest = function SessionJournalXMLHttpRequest() {
	const xhr = new NativeXMLHttpRequest();
	let method = 'GET';
	let url = '';
	let requestBody: any = null;
	let started = 0;

	const originalOpen = xhr.open;
	xhr.open = function (nextMethod, nextUrl, ...rest: any[]) {
		method = String(nextMethod || 'GET').toUpperCase();
		url = String(nextUrl || '');
		return (originalOpen as (...args: any[]) => any).call(xhr, nextMethod, nextUrl, ...rest);
	};

	const originalSend = xhr.send;
	xhr.send = function (body) {
		started = performance.now();
		requestBody = summarizeRequestBody(body);
		return originalSend.call(xhr, body);
	};

	xhr.addEventListener('loadend', () => {
		if (xhr.status >= 400 || xhr.status === 0) {
			let response = '';
			try { response = xhr.responseText || ''; } catch {}
			send('network.error', {
				transport: 'xhr',
				method,
				url: sanitizeUrl(url),
				status: xhr.status,
				statusText: xhr.statusText,
				requestBody,
				response: truncate(response),
				durationMs: Math.round(performance.now() - started),
			});
		}
	});

	return xhr;
} as any;
window.XMLHttpRequest.prototype = NativeXMLHttpRequest.prototype;

send('load', { url: location.href, title: document.title });

const origPush = history.pushState;
history.pushState = function (...args) {
	const result = origPush.apply(this, args);
	send('navigate', { url: location.href, via: 'pushState' });
	return result;
};
const origReplace = history.replaceState;
history.replaceState = function (...args) {
	const result = origReplace.apply(this, args);
	send('navigate', { url: location.href, via: 'replaceState' });
	return result;
};
window.addEventListener('popstate', () => {
	send('navigate', { url: location.href, via: 'popstate' });
});

for (const level of ['error', 'warn']) {
	const original = console[level];
	console[level] = (...args) => {
		try {
			const text = args.map((arg) => {
				if (arg instanceof Error) {
					return arg.stack || arg.message;
				}
				if (typeof arg === 'object') {
					try { return JSON.stringify(arg); } catch { return String(arg); }
				}
				return String(arg);
			}).join(' ');
			send('console.' + level, { text: truncate(text) });
		} catch {}
		original.apply(console, args);
	};
}

window.addEventListener('error', (e) => {
	send('window.error', {
		message: truncate(e.message),
		source: e.filename || null,
		line: e.lineno || null,
		col: e.colno || null,
		stack: e.error && e.error.stack ? truncate(e.error.stack) : null,
	});
});

window.addEventListener('unhandledrejection', (e) => {
	const reason = e.reason;
	send('unhandledrejection', {
		message: truncate(reason && reason.message ? reason.message : String(reason)),
		stack: reason && reason.stack ? truncate(reason.stack) : null,
	});
});

const root = document.getElementById('root');
if (root) {
	let blankTimer: ReturnType<typeof setTimeout> | null = null;
	const check = () => {
		if (root.children.length === 0) {
			if (!blankTimer) {
				blankTimer = setTimeout(() => {
					send('root.empty', { url: location.href });
					blankTimer = null;
				}, 300);
			}
		} else if (blankTimer) {
			clearTimeout(blankTimer);
			blankTimer = null;
		}
	};
	new MutationObserver(check).observe(root, { childList: true });
}
