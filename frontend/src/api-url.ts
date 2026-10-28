// Vite replaces this public setting at build time; an unset value keeps both
// the development proxy and the local same-origin Nginx demo working.
export function apiUrl(path: string, base = import.meta.env?.VITE_API_BASE_URL as string | undefined) {
  return `${base?.trim().replace(/\/+$/, "") ?? ""}${path}`;
}
