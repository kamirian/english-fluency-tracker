// English Fluency Tracker — Google sign-in and sessions.
// Copyright (c) 2026 Kiyan Amirian. All rights reserved.

import { base64ToBytes, base64Url, randomToken, sha256, sha256Hex } from "./crypto.js";
import { HttpError, buildCookie, clearCookie, cookieName, htmlMessage, json, parseCookies, redirect, requireSameOrigin } from "./http.js";

const SESSION_DAYS = 30;
const OAUTH_COOKIE_MINUTES = 10;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const TAB_PATTERN = /^[a-z]{1,20}$/;

const sessionCookie = url => cookieName(url, "eft_session");
const oauthCookie = url => cookieName(url, "eft_oauth");

export function googleConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function devLoginEnabled(env, url) {
  return env.DEV_LOGIN === "true" && ["localhost", "127.0.0.1"].includes(url.hostname);
}

export function publicConfig(env, url) {
  return { googleSignIn: googleConfigured(env), devLogin: devLoginEnabled(env, url) };
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name || "", picture: row.picture || "" } : null;
}

export async function currentUser(request, env, url) {
  const token = parseCookies(request)[sessionCookie(url)];
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare(
    "SELECT users.id, users.email, users.name, users.picture FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?"
  ).bind(await sha256Hex(token), new Date().toISOString()).first();
  return publicUser(row);
}

export async function requireUser(request, env, url) {
  const user = await currentUser(request, env, url);
  if (!user) throw new HttpError(401, "Please sign in first.", { signedIn: false });
  return user;
}

function emailAllowed(env, email) {
  const rules = String(env.ALLOWED_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const address = String(email || "").toLowerCase();
  return rules.some(rule => rule.startsWith("@") ? address.endsWith(rule) : address === rule);
}

async function createSession(env, url, userId) {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256Hex(token), userId, now.toISOString(), expires.toISOString())
  ]);
  return buildCookie(url, sessionCookie(url), token, SESSION_DAYS * 86400);
}

async function upsertUser(env, { sub, email, name, picture }) {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(sub).first();
  if (existing) {
    await env.DB.prepare("UPDATE users SET email = ?, name = ?, picture = ?, last_login_at = ? WHERE id = ?").bind(email, name, picture, now, existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, sub, email, name, picture, now, now).run();
  return id;
}

function returnTab(value) {
  return TAB_PATTERN.test(String(value || "")) ? value : "settings";
}

function redirectUri(env, url) {
  return env.GOOGLE_REDIRECT_URI || `${url.origin}/auth/google/callback`;
}

async function startGoogle(env, url) {
  if (!googleConfigured(env)) return htmlMessage("Google sign-in is not set up", "The site owner still needs to add a Google OAuth client ID and secret. You can keep using the tracker on this device.", 503);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = base64Url(await sha256(verifier));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ state, verifier, tab: returnTab(url.searchParams.get("return")), at: Date.now() })));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env, url),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account"
  });
  return redirect(`${env.GOOGLE_AUTH_URL || GOOGLE_AUTH_URL}?${params}`, [buildCookie(url, oauthCookie(url), payload, OAUTH_COOKIE_MINUTES * 60)]);
}

function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) throw new Error("Missing ID token.");
  return JSON.parse(new TextDecoder().decode(base64ToBytes(part)));
}

async function finishGoogle(request, env, url) {
  if (!googleConfigured(env)) return htmlMessage("Google sign-in is not set up", "The site owner still needs to add a Google OAuth client ID and secret.", 503);
  const clearOauth = clearCookie(url, oauthCookie(url));
  let saved;
  try {
    saved = JSON.parse(new TextDecoder().decode(base64ToBytes(parseCookies(request)[oauthCookie(url)] || "")));
  } catch {
    saved = null;
  }
  if (url.searchParams.get("error")) return redirect(`/?signin=cancelled#${returnTab(saved?.tab)}`, [clearOauth]);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!saved || !state || saved.state !== state || Date.now() - Number(saved.at || 0) > OAUTH_COOKIE_MINUTES * 60000 || !code) {
    return htmlMessage("Sign-in expired", "That sign-in attempt could not be verified. Please go back and try again.", 400);
  }

  const tokenResponse = await fetch(env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env, url), grant_type: "authorization_code", code_verifier: saved.verifier })
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.id_token) return htmlMessage("Sign-in failed", "Google did not complete the sign-in. Please try again.", 502);

  // The ID token came straight from Google's token endpoint over TLS, so its claims are
  // trusted without a separate signature check (OpenID Connect Core, section 3.1.3.7).
  let claims;
  try { claims = decodeJwtPayload(tokens.id_token); } catch { return htmlMessage("Sign-in failed", "Google returned an unreadable sign-in token.", 502); }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!GOOGLE_ISSUERS.has(claims.iss) || !audience.includes(env.GOOGLE_CLIENT_ID) || Number(claims.exp) * 1000 < Date.now() || !claims.sub) {
    return htmlMessage("Sign-in failed", "The sign-in token could not be verified.", 400);
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") return htmlMessage("Email not verified", "Please verify the email address on your Google account, then try again.", 403);
  if (!emailAllowed(env, claims.email)) return redirect(`/?signin=not-allowed#${returnTab(saved.tab)}`, [clearOauth]);

  const userId = await upsertUser(env, { sub: String(claims.sub), email: String(claims.email || ""), name: String(claims.name || "").slice(0, 120), picture: String(claims.picture || "").slice(0, 500) });
  return redirect(`/?signin=ok#${returnTab(saved.tab)}`, [clearOauth, await createSession(env, url, userId)]);
}

async function devLogin(env, url) {
  if (!devLoginEnabled(env, url)) throw new HttpError(404, "Not found.");
  const email = (url.searchParams.get("email") || "tester@example.com").slice(0, 120).toLowerCase();
  const userId = await upsertUser(env, { sub: `dev:${email}`, email, name: url.searchParams.get("name") || "Test learner", picture: "" });
  return redirect(`/?signin=ok#${returnTab(url.searchParams.get("return"))}`, [await createSession(env, url, userId)]);
}

async function logout(request, env, url) {
  requireSameOrigin(request, url);
  const token = parseCookies(request)[sessionCookie(url)];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(url, sessionCookie(url)) });
}

export async function deleteAccount(request, env, url, user) {
  requireSameOrigin(request, url);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ai_connections WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM tracker_states WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id)
  ]);
  return json({ ok: true, deleted: true }, 200, { "Set-Cookie": clearCookie(url, sessionCookie(url)) });
}

export async function handleAuthRoute(request, env, url) {
  if (!env.DB) return htmlMessage("Storage is not set up", "The site owner still needs to connect the database.", 503);
  if (url.pathname === "/auth/google/start" && request.method === "GET") return startGoogle(env, url);
  if (url.pathname === "/auth/google/callback" && request.method === "GET") return finishGoogle(request, env, url);
  if (url.pathname === "/auth/dev-login" && request.method === "GET") return devLogin(env, url);
  if (url.pathname === "/auth/logout" && request.method === "POST") return logout(request, env, url);
  throw new HttpError(404, "Not found.");
}
