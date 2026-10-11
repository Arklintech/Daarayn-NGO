/**
 * lib/authCookies.ts
 *
 * Browser-side helpers for the cookies that carry the Firebase session.
 *   daarayn_token   — Firebase ID token, verified by lib/server/auth.ts on every API call
 *   daarayn_session — presence flag used by middleware.ts to redirect to the login pages
 */

const TOKEN_COOKIE = "daarayn_token";
const SESSION_COOKIE = "daarayn_session";

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; path=/; max-age=${maxAgeSeconds}; SameSite=Strict${secure}`;
}

export function writeAuthCookies(idToken: string) {
  if (typeof document === "undefined") return;
  // Firebase ID tokens are valid for one hour and refreshed automatically before expiry.
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(idToken)}${cookieAttributes(3600)}`;
  document.cookie = `${SESSION_COOKIE}=active${cookieAttributes(86400)}`;
}

export function clearAuthCookies() {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=${cookieAttributes(0)}`;
  document.cookie = `${SESSION_COOKIE}=${cookieAttributes(0)}`;
}
