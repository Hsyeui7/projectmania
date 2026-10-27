const ALLOWED_PARENT_ORIGINS = [
	"https://horizons.hostinger.com",
	"https://horizons.hostinger.dev",
	"https://ai-builder.hostinger.com",
	"https://ai-builder.hostinger.dev",
	"https://horizons-frontend-local.hostinger.dev",
];
const getParentOrigin = () => {
	if (
		window.location.ancestorOrigins &&
		window.location.ancestorOrigins.length > 0
	) {
		return window.location.ancestorOrigins[0];
	}

	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch (e) {
			console.warn("Invalid referrer URL:", document.referrer);
		}
	}

	return null;
};

window.addEventListener("message", function (event) {
	const parentOrigin = getParentOrigin();

	if (event.data?.type === "database_preview_auth" && parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
		localStorage.setItem("__pb_superuser_auth__", event.data.value);
	}
});
