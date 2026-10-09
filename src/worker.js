// English Fluency Tracker — Cloudflare Worker entry point.
// Copyright (c) 2026 Kiyan Amirian. Licensed under the MIT License.
//
// Static files in /public are served by Workers Static Assets. This script handles
// sign-in (/auth/*) and the JSON API (/api/*).

import { handleAiRoute } from "./ai.js";
import { currentUser, deleteAccount, handleAuthRoute, publicConfig, requireUser } from "./auth.js";
import { encryptionConfigured } from "./crypto.js";
import { HttpError, json } from "./http.js";
import { handleSync } from "./sync.js";

async function handleApi(request, env, url) {
  if (!env.DB) throw new HttpError(503, "The database is not connected yet.");
  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = await currentUser(request, env, url);
    return json({ signedIn: Boolean(user), user, config: { ...publicConfig(env, url), keyStorage: encryptionConfigured(env) } });
  }
  const user = await requireUser(request, env, url);
  if (url.pathname === "/api/me" && request.method === "DELETE") return deleteAccount(request, env, url, user);
  if (url.pathname === "/api/sync") return handleSync(request, env, url, user);
  if (url.pathname.startsWith("/api/ai/")) return handleAiRoute(request, env, url, user);
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/auth/")) return await handleAuthRoute(request, env, url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
      console.error(error);
      const message = String(error?.message || "");
      if (message.includes("no such table")) return json({ error: "The database tables are not set up yet. Run the D1 migrations." }, 503);
      return json({ error: "Something went wrong on the server. Your local copy is safe." }, 500);
    }
  }
};
