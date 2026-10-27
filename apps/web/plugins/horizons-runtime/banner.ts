export function getTemplateBannerAttrs() {
	const src = process.env.TEMPLATE_BANNER_SCRIPT_URL;
	const redirectUrl = process.env.TEMPLATE_REDIRECT_URL;

	if (!src || !redirectUrl) {
		return null;
	}

	return {
		src,
		'template-redirect-url': redirectUrl,
		...(process.env.TEMPLATE_BANNER_MAIN_TEXT && { 'template-main-text': process.env.TEMPLATE_BANNER_MAIN_TEXT }),
		...(process.env.TEMPLATE_BANNER_CTA_TEXT && { 'template-cta-text': process.env.TEMPLATE_BANNER_CTA_TEXT }),
		...(process.env.TEMPLATE_BANNER_THEME && { 'template-theme': process.env.TEMPLATE_BANNER_THEME }),
	};
}
