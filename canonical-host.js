// Plain JS so worker.js can import it before the Next.js bundle runs.

/**
 * Where to send a request that arrived on a non-canonical host (www., *.workers.dev), or null to serve it.
 * Only those two shapes move, so local previews and the internal self-binding host ("internal") are untouched.
 * @param {string} requestUrl
 * @param {string | undefined} appUrl
 * @returns {string | null}
 */
export function canonicalRedirect(requestUrl, appUrl) {
  if (!appUrl) return null;
  const url = new URL(requestUrl);
  const canonical = new URL(appUrl);
  if (url.host === canonical.host) return null;
  const strayHost = url.hostname === `www.${canonical.hostname}` || url.hostname.endsWith(".workers.dev");
  if (!strayHost || canonical.hostname.endsWith(".workers.dev")) return null;
  return `${canonical.origin}${url.pathname}${url.search}`;
}
