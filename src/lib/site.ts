/**
 * The public origin, read directly from process.env rather than the validated
 * env(): metadata, robots.txt and the sitemap are evaluated at build time, and
 * a local build without APP_URL must not fail.
 *
 * Trailing slashes are stripped here for the same reason as in env.ts - this
 * value is concatenated with paths.
 */
export const siteUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
