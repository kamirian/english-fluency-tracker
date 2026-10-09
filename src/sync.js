// English Fluency Tracker — per-account cloud copy of the tracker.
// Copyright (c) 2026 Kiyan Amirian. All rights reserved.

import { HttpError, json, rateLimit, readJson, requireSameOrigin } from "./http.js";

const MAX_STATE_BYTES = 1000000;

function parseStoredState(row) {
  if (!row?.state_json) return null;
  try {
    const state = JSON.parse(row.state_json);
    return state && typeof state === "object" && !Array.isArray(state) ? state : null;
  } catch {
    return null;
  }
}

export async function handleSync(request, env, url, user) {
  requireSameOrigin(request, url);
  rateLimit(`sync:${user.id}`, Number(env.SYNC_REQUESTS_PER_HOUR) || 600);
  // A tab that still shows another account must never read or write this account's copy.
  const expectedUser = request.headers.get("X-Expected-User");
  if (expectedUser && expectedUser !== user.id) return json({ error: "A different account is signed in on this browser.", accountMismatch: true }, 412);
  const row = await env.DB.prepare("SELECT state_json, revision, updated_at FROM tracker_states WHERE user_id = ?").bind(user.id).first();
  if (request.method === "GET") return json({ state: parseStoredState(row), revision: Number(row?.revision) || 0, updatedAt: row?.updated_at || null });
  if (request.method !== "PUT") throw new HttpError(405, "Method not allowed.");

  const body = await readJson(request, MAX_STATE_BYTES + 20000);
  const nextState = body.state;
  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState) || !nextState.entries) throw new HttpError(400, "The tracker data is not valid.");
  const stateJson = JSON.stringify(nextState);
  if (stateJson.length > MAX_STATE_BYTES) throw new HttpError(413, "Your tracker backup is too large to sync.");

  const currentRevision = Number(row?.revision) || 0;
  const baseRevision = Number(body.baseRevision) || 0;
  if (row && baseRevision !== currentRevision) {
    return json({ error: "Cloud data changed on another device.", conflict: true, state: parseStoredState(row), revision: currentRevision, updatedAt: row.updated_at }, 409);
  }
  const revision = currentRevision + 1;
  const updatedAt = new Date().toISOString();
  // The revision guard in WHERE makes concurrent writes from two devices safe.
  const result = row
    ? await env.DB.prepare("UPDATE tracker_states SET state_json = ?, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(stateJson, revision, updatedAt, user.id, currentRevision).run()
    : await env.DB.prepare("INSERT OR IGNORE INTO tracker_states (user_id, state_json, revision, updated_at) VALUES (?, ?, ?, ?)").bind(user.id, stateJson, revision, updatedAt).run();
  if (!result.meta?.changes) {
    const latest = await env.DB.prepare("SELECT state_json, revision, updated_at FROM tracker_states WHERE user_id = ?").bind(user.id).first();
    return json({ error: "Cloud data changed on another device.", conflict: true, state: parseStoredState(latest), revision: Number(latest?.revision) || 0, updatedAt: latest?.updated_at || null }, 409);
  }
  return json({ ok: true, revision, updatedAt });
}
