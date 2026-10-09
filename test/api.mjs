// API-level checks against a running `wrangler dev` and test/mock-ai.mjs.
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const MOCK = process.env.MOCK || "http://127.0.0.1:8790";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };

function client() {
  const jar = {};
  const store = response => { for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(";"); const [k, ...v] = pair.split("="); const value = v.join("="); if (/Max-Age=0/.test(cookie)) delete jar[k]; else jar[k] = value; } };
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    jar,
    async raw(path, init = {}) { const response = await fetch(BASE + path, { redirect: "manual", ...init, headers: { ...(init.headers || {}), Cookie: cookieHeader() } }); store(response); return response; },
    async api(path, method = "GET", body, extraHeaders = {}) {
      const headers = { Origin: BASE, ...extraHeaders };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await this.raw(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: response.status, data };
    },
    async follow(path) { let response = await this.raw(path); let hops = 0; while ([301, 302].includes(response.status) && hops++ < 6) { const location = response.headers.get("location"); const next = new URL(location, BASE); response = next.origin === new URL(BASE).origin ? await this.raw(next.pathname + next.search) : await fetch(next, { redirect: "manual" }); if (next.origin !== new URL(BASE).origin) { const loc = response.headers.get("location"); if (loc) { const back = new URL(loc); response = await this.raw(back.pathname + back.search); } } } return response; }
  };
}

const alice = client();
const bob = client();

await check("signed out /api/me", async () => { const { data } = await alice.api("/api/me"); assert.equal(data.signedIn, false); assert.equal(data.config.googleSignIn, true); });
await check("protected route needs sign-in", async () => { const { status } = await alice.api("/api/sync"); assert.equal(status, 401); });
await check("google start redirects with PKCE + state", async () => {
  const response = await alice.raw("/auth/google/start?return=practice");
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("state"));
  assert.equal(location.searchParams.get("redirect_uri"), `${BASE}/auth/google/callback`);
  assert.equal(location.searchParams.get("scope"), "openid email profile");
});
await check("callback rejects wrong state", async () => { const response = await bob.raw("/auth/google/callback?code=x&state=nope"); assert.equal(response.status, 400); });
await check("full Google flow signs in alice", async () => {
  await fetch(`${MOCK}/__google_user?email=alice@example.com`);
  const response = await alice.follow("/auth/google/start?return=practice");
  const { data } = await alice.api("/api/me");
  assert.equal(data.signedIn, true, JSON.stringify(data));
  assert.equal(data.user.email, "alice@example.com");
});
await check("dev login signs in bob", async () => { await bob.follow("/auth/dev-login?email=bob@example.com&name=Bob"); const { data } = await bob.api("/api/me"); assert.equal(data.user.email, "bob@example.com"); });
await check("cross-origin write blocked", async () => { const { status } = await alice.api("/api/sync", "PUT", { state: { entries: {} }, baseRevision: 0 }, { Origin: "https://evil.example" }); assert.equal(status, 403); });

await check("sync: alice writes, bob cannot see it", async () => {
  let r = await alice.api("/api/sync", "PUT", { state: { entries: { "2026-10-01": { status: "practiced" } }, library: [] }, baseRevision: 0 });
  assert.equal(r.status, 200); assert.equal(r.data.revision, 1);
  r = await bob.api("/api/sync"); assert.equal(r.data.state, null);
  r = await alice.api("/api/sync"); assert.ok(r.data.state.entries["2026-10-01"]);
});
await check("sync: stale revision returns 409 with cloud copy", async () => { const r = await alice.api("/api/sync", "PUT", { state: { entries: {} }, baseRevision: 0 }); assert.equal(r.status, 409); assert.equal(r.data.revision, 1); });

const created = {};
const providers = [
  ["openai", { provider: "openai", apiKey: "sk-test-openai-1234567890", model: "gpt-test", options: { reasoningEffort: "low" } }],
  ["anthropic", { provider: "anthropic", apiKey: "sk-test-ant-abcdefghij", model: "claude-test" }],
  ["gemini", { provider: "gemini", apiKey: "AIzaTestKey123456789", model: "gemini-test" }],
  ["gemini-old", { provider: "gemini", apiKey: "AIzaTestKey123456789", model: "gemini-old" }],
  ["compatible", { provider: "compatible", apiKey: "sk-test-compat-xyz12345", model: "gpt-test", baseUrl: `${MOCK}/compat/v1` }],
  ["compatible-fallback", { provider: "compatible", apiKey: "sk-test-compat-xyz12345", model: "no-schema-model", baseUrl: `${MOCK}/compat/v1` }]
];
await check("list models before saving (openai filters non-chat)", async () => { const r = await alice.api("/api/ai/models", "POST", { provider: "openai", apiKey: "sk-test-openai-1234567890" }); assert.equal(r.status, 200); assert.ok(r.data.models.some(m => m.id === "gpt-test")); assert.ok(!r.data.models.some(m => m.id.includes("embedding"))); });
await check("list gemini models keeps only generateContent", async () => { const r = await alice.api("/api/ai/models", "POST", { provider: "gemini", apiKey: "AIzaTestKey123456789" }); assert.deepEqual(r.data.models.map(m => m.id), ["gemini-test"]); });
await check("bad key error is redacted", async () => { const r = await alice.api("/api/ai/models", "POST", { provider: "openai", apiKey: "sk-live-supersecretkey123456" }); assert.equal(r.status, 502); assert.ok(!r.data.error.includes("supersecretkey123456"), r.data.error); });
await check("https required for custom base URL in production", async () => { const r = await alice.api("/api/ai/models", "POST", { provider: "compatible", apiKey: "sk-test-x", baseUrl: "ftp://example.com" }); assert.equal(r.status, 400); });

for (const [name, body] of providers) {
  await check(`save connection: ${name}`, async () => { const r = await alice.api("/api/ai/connections", "POST", { ...body, label: name }); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(!JSON.stringify(r.data).includes(body.apiKey)); created[name] = r.data.connection.id; });
}
await check("connections list never returns keys", async () => { const r = await alice.api("/api/ai/connections"); assert.equal(r.data.connections.length, providers.length); assert.ok(!JSON.stringify(r.data).match(/sk-test-openai-1234567890|AIzaTestKey123456789/)); });
await check("bob cannot use alice's connection", async () => { const r = await bob.api("/api/ai/run", "POST", { task: "library_review", prompt: "x", connectionId: created.openai }); assert.equal(r.status, 404); });
await check("bob without connection gets 409", async () => { const r = await bob.api("/api/ai/run", "POST", { task: "library_review", prompt: "x" }); assert.equal(r.status, 409); });

const session = { id: "sess-1", mode: "conversation", topic: "work", maxTurns: 6, targetMode: "smart", targetCount: 2, targets: [], targetCandidates: [{ id: "11111111-1111-1111-1111-111111111111", type: "collocation", front: "make a decision", back: "decide", tags: [] }, { id: "22222222-2222-2222-2222-222222222222", type: "phrasal_verb", front: "figure out", back: "understand", tags: [] }], messages: [] };
for (const [name] of providers) {
  await check(`${name}: test connection`, async () => { const r = await alice.api(`/api/ai/connections/${created[name]}/test`, "POST", {}); assert.equal(r.data.ok, true, JSON.stringify(r.data)); });
  await check(`${name}: practice start/reply/evaluate`, async () => {
    let r = await alice.api("/api/ai/run", "POST", { task: "practice_start", session, connectionId: created[name], learner: { name: "Alice", variety: "British English" } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.match(r.data.result.reply, /Mock coach/); assert.equal(r.data.result.selected_target_ids.length, 2); assert.ok(r.data.usage.input_tokens > 0);
    const withReply = { ...session, messages: [{ role: "assistant", content: r.data.result.reply }, { role: "user", content: "I decided to change teams." }] };
    r = await alice.api("/api/ai/run", "POST", { task: "practice_reply", session: withReply, connectionId: created[name] });
    assert.equal(r.status, 200); assert.equal(typeof r.data.result.should_end, "boolean");
    r = await alice.api("/api/ai/run", "POST", { task: "practice_evaluate", session: withReply, connectionId: created[name] });
    assert.equal(r.status, 200); assert.equal(r.data.result.scores.overall, 81);
  });
  await check(`${name}: library/writing/activity reviews`, async () => {
    let r = await alice.api("/api/ai/run", "POST", { task: "library_review", prompt: 'Items to review:\n[{"id": "lib-1"}]', connectionId: created[name] });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.result.reviews[0].id, "lib-1");
    r = await alice.api("/api/ai/run", "POST", { task: "writing_review", prompt: 'writing_review_version\n{"date": "2026-10-02"}', connectionId: created[name] });
    assert.equal(r.data.result.date, "2026-10-02");
    r = await alice.api("/api/ai/run", "POST", { task: "activity_review", prompt: 'activity_review_version\n{"id": "act-9"}', connectionId: created[name] });
    assert.equal(r.data.result.session_id, "act-9");
  });
}
await check("reply without learner message is rejected", async () => { const r = await alice.api("/api/ai/run", "POST", { task: "practice_reply", session: { ...session, messages: [{ role: "assistant", content: "hi" }] } }); assert.equal(r.status, 400); });
await check("set default + edit model + delete", async () => {
  let r = await alice.api(`/api/ai/connections/${created.anthropic}`, "PATCH", { isDefault: true, model: "claude-test" }); assert.equal(r.data.connection.isDefault, true);
  r = await alice.api("/api/ai/connections"); assert.equal(r.data.connections.filter(c => c.isDefault).length, 1);
  r = await alice.api(`/api/ai/connections/${created["gemini-old"]}`, "DELETE"); assert.equal(r.status, 200);
});
const log = await (await fetch(`${MOCK}/__log`)).json();
await check("fallbacks were exercised (gemini-old, no-schema-model)", async () => {
  assert.ok(log.some(e => e.model.startsWith("gemini-old") && e.format === "json_mode"));
  assert.ok(log.some(e => e.model === "no-schema-model" && e.format === "json_object"));
  assert.ok(log.every(e => !e.auth || e.auth.includes("sk-test") || e.auth.includes("AIzaTest") || e.auth.includes("supersecret")));
});
await check("changing a saved base URL requires the key again", async () => {
  let r = await alice.api(`/api/ai/connections/${created.compatible}`, "PATCH", { baseUrl: "http://127.0.0.1:8791/attacker" });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  r = await alice.api(`/api/ai/connections/${created.compatible}`, "PATCH", { apiKey: "   " });
  assert.equal(r.status, 400);
  r = await alice.api(`/api/ai/connections/${created.compatible}`, "PATCH", { baseUrl: `${MOCK}/compat/v1`, label: "same url ok" });
  assert.equal(r.status, 200);
});
await check("base URL with query or fragment is rejected", async () => {
  for (const baseUrl of [`${MOCK}/compat/v1?x=1`, `${MOCK}/compat/v1#frag`]) {
    const r = await alice.api("/api/ai/models", "POST", { provider: "compatible", apiKey: "sk-test-x", baseUrl });
    assert.equal(r.status, 400, baseUrl);
  }
});
await check("non-JSON provider error bodies are not echoed", async () => {
  const r = await alice.api("/api/ai/models", "POST", { provider: "compatible", apiKey: "sk-test-x", baseUrl: `${MOCK}/html/v1` });
  assert.equal(r.status, 502); assert.ok(!r.data.error.includes("secret-ish"), r.data.error);
});
await check("malformed third-party cookie does not break the API", async () => {
  const response = await fetch(`${BASE}/api/me`, { headers: { Cookie: "other=%E0%A4%A" } });
  assert.equal(response.status, 200);
});
await check("sync rejects a tab that expects a different account", async () => {
  const r = await alice.api("/api/sync", "GET", undefined, { "X-Expected-User": "someone-else" });
  assert.equal(r.status, 412); assert.equal(r.data.accountMismatch, true);
});
await check("logout ends session", async () => { const r = await bob.api("/auth/logout", "POST", {}); assert.equal(r.status, 200); const me = await bob.api("/api/me"); assert.equal(me.data.signedIn, false); });
await check("delete account removes data", async () => {
  const r = await alice.api("/api/me", "DELETE"); assert.equal(r.status, 200);
  const me = await alice.api("/api/me"); assert.equal(me.data.signedIn, false);
  await fetch(`${MOCK}/__google_user?email=alice@example.com`); await alice.follow("/auth/google/start");
  const sync = await alice.api("/api/sync"); assert.equal(sync.data.state, null);
  const conns = await alice.api("/api/ai/connections"); assert.equal(conns.data.connections.length, 0);
});
console.log(results.join("\n"));
console.log(`\n${results.filter(r => r.startsWith("PASS")).length}/${results.length} passed`);
