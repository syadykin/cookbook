/**
 * The Go server rewrites `<base href="/">` in index.html to carry its configured prefix, so the
 * prefix is read from the document rather than baked into the bundle.
 */
const baseHref = document.getElementsByTagName('base')[0]?.getAttribute('href') || '/';

/** Router basename: the prefix without a trailing slash, or "/" at the site root. */
export const basename = baseHref.replace(/\/+$/, '') || '/';

/** Absolute path of the API root, e.g. "/recipes/api". */
export const apiUrl = (basename === '/' ? '' : basename) + '/api';
