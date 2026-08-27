/**
 * The public origin, read directly from process.env rather than the validated
 * env(): metadata, robots.txt and the sitemap are evaluated at build time, and
 * a local build without APP_URL must not fail.
 */
export const siteUrl = process.env.APP_URL ?? "http://localhost:3000";
