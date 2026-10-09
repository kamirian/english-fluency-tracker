// English Fluency Tracker — HTTP helpers shared by the API routes.
// Copyright (c) 2026 Kiyan Amirian. Licensed under the MIT License.

export const securityHeaders = {
  "Cache-Control": "no-store",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(value, status = 200, headers = {}) {
  const responseHeaders = new Headers({ ...securityHeaders, "Content-Type": "application/json; charset=utf-8" });
  for (const [key, entry] of Object.entries(headers)) {
    if (Array.isArray(entry)) entry.forEach(item => responseHeaders.append(key, item));
    else responseHeaders.set(key, entry);
  }
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ ...securityHeaders, Location: location });
  cookies.forEach(cookie => headers.append("Set-Cookie", cookie));
  return new Response(null, { status: 302, headers });
}

export function htmlMessage(title, message, status = 200) {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111d;color:#edf7ff;font:16px/1.55 system-ui,sans-serif}main{max-width:520px;margin:24px;padding:28px;border:1px solid #284156;border-radius:20px;background:#0e1d2c}a{color:#5eead4}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p><a href="/#settings">Back to the tracker</a></p></main></body></html>`;
  return new Response(body, { status, headers: { ...securityHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

export function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore malformed cookies from other apps */ }
  }
  return cookies;
}

export function isSecure(url) {
  return url.protocol === "https:";
}

export function cookieName(url, base) {
  return isSecure(url) ? `__Host-${base}` : base;
}

export function buildCookie(url, name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isSecure(url) ? "; Secure" : ""}`;
}

export function clearCookie(url, name) {
  return buildCookie(url, name, "", 0);
}

// Every state-changing request must come from this site's own pages.
export function requireSameOrigin(request, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (origin !== url.origin) throw new HttpError(403, "Cross-origin requests are not allowed.");
}

export async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "This request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "This request is too large.");
  try {
    const value = JSON.parse(text || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "The request body must be a JSON object.");
  }
}

// Per-isolate limiter. It smooths bursts; it is not a billing control.
const buckets = new Map();
export function rateLimit(key, maximum, windowMs = 3600000) {
  const current = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: current + windowMs };
  if (current > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = current + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    for (const [entryKey, entry] of buckets) if (current > entry.resetAt) buckets.delete(entryKey);
  }
  if (bucket.count > maximum) throw new HttpError(429, "Too many requests. Please wait a little and try again.");
}
