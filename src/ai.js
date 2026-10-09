// English Fluency Tracker — bring-your-own-key AI providers.
// Copyright (c) 2026 Kiyan Amirian. Licensed under the MIT License.

import { AI_TASKS, cleanLearner, cleanSession, practiceInstructions, practiceTask, reviewSystemPrompt } from "../public/shared/prompts.js";
import { decryptSecret, encryptSecret, encryptionConfigured } from "./crypto.js";
import { HttpError, json, rateLimit, readJson, requireSameOrigin } from "./http.js";

export const PROVIDERS = {
  openai: { label: "OpenAI", base: "https://api.openai.com/v1", env: "OPENAI_API_BASE" },
  anthropic: { label: "Anthropic", base: "https://api.anthropic.com/v1", env: "ANTHROPIC_API_BASE" },
  gemini: { label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta", env: "GEMINI_API_BASE" },
  compatible: { label: "OpenAI-compatible service", base: "", env: "" }
};
const MAX_CONNECTIONS = 10;
const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high"]);
const NON_CHAT_MODEL = /embed|whisper|tts|dall-e|audio|realtime|transcri|moderation|image|search|davinci|babbage|sora|computer-use|codex-mini/i;

// ---------- connection storage ----------

export function cleanBaseUrl(env, value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new HttpError(400, "Enter a valid API base URL, such as https://openrouter.ai/api/v1."); }
  const localTesting = env.ALLOW_HTTP_AI_BASE === "true";
  if (parsed.protocol !== "https:" && !(localTesting && parsed.protocol === "http:")) throw new HttpError(400, "The API base URL must start with https://.");
  if (parsed.username || parsed.password || parsed.search || parsed.hash || raw.includes("#") || raw.includes("?") || raw.length > 300) throw new HttpError(400, "Use a plain API base URL without a query string, fragment, or login details.");
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  const privateHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || !host.includes(".");
  if (privateHost && !localTesting) throw new HttpError(400, "Use the provider's public API address (a domain name, not an IP address or local host).");
  return raw;
}

function cleanModel(value) {
  const model = String(value || "").trim().replace(/^models\//, "");
  if (!model || model.length > 200 || /\s/.test(model)) throw new HttpError(400, "Choose or type a model ID.");
  return model;
}

function cleanOptions(provider, raw) {
  const options = {};
  if (provider === "openai" && REASONING_EFFORTS.has(raw?.reasoningEffort)) options.reasoningEffort = raw.reasoningEffort;
  return options;
}

function keyHint(apiKey) {
  return apiKey.length > 8 ? apiKey.slice(-4) : "set";
}

function publicConnection(row) {
  return {
    id: row.id, provider: row.provider, providerLabel: PROVIDERS[row.provider]?.label || row.provider,
    label: row.label, baseUrl: row.base_url || "", model: row.model, options: JSON.parse(row.options_json || "{}"),
    keyHint: row.key_hint, isDefault: Boolean(row.is_default), updatedAt: row.updated_at
  };
}

async function listConnections(env, userId) {
  const { results } = await env.DB.prepare("SELECT * FROM ai_connections WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC").bind(userId).all();
  return results || [];
}

async function loadConnection(env, userId, connectionId) {
  const row = connectionId
    ? await env.DB.prepare("SELECT * FROM ai_connections WHERE user_id = ? AND id = ?").bind(userId, connectionId).first()
    : await env.DB.prepare("SELECT * FROM ai_connections WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC LIMIT 1").bind(userId).first();
  if (!row) throw new HttpError(connectionId ? 404 : 409, connectionId ? "That AI connection was not found." : "Connect an AI provider in Settings first, or use the copy-and-paste option.");
  return row;
}

async function connectionWithKey(env, userId, row) {
  let apiKey;
  try { apiKey = await decryptSecret(env, row.key_ciphertext, row.key_iv, `${userId}:${row.id}`); } catch { throw new HttpError(500, "This saved API key can no longer be read. Remove the connection and add the key again."); }
  return { provider: row.provider, baseUrl: row.base_url || "", model: row.model, options: JSON.parse(row.options_json || "{}"), apiKey };
}

function requireEncryption(env) {
  if (!encryptionConfigured(env)) throw new HttpError(503, "The site owner still needs to set KEY_ENCRYPTION_SECRET before API keys can be saved.");
}

async function createConnection(request, env, user) {
  requireEncryption(env);
  const body = await readJson(request, 20000);
  const provider = String(body.provider || "");
  if (!PROVIDERS[provider]) throw new HttpError(400, "Choose a supported provider.");
  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey || apiKey.length > 500) throw new HttpError(400, "Paste a valid API key.");
  const existing = await listConnections(env, user.id);
  if (existing.length >= MAX_CONNECTIONS) throw new HttpError(400, `You can save up to ${MAX_CONNECTIONS} AI connections.`);
  const baseUrl = provider === "compatible" ? cleanBaseUrl(env, body.baseUrl) : "";
  const model = cleanModel(body.model);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const label = String(body.label || "").trim().slice(0, 60) || `${PROVIDERS[provider].label} · ${model}`;
  const sealed = await encryptSecret(env, apiKey, `${user.id}:${id}`);
  const makeDefault = !existing.length || body.isDefault !== false;
  const statements = [];
  if (makeDefault) statements.push(env.DB.prepare("UPDATE ai_connections SET is_default = 0 WHERE user_id = ?").bind(user.id));
  statements.push(env.DB.prepare("INSERT INTO ai_connections (id, user_id, provider, label, base_url, model, options_json, key_ciphertext, key_iv, key_hint, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, provider, label, baseUrl, model, JSON.stringify(cleanOptions(provider, body.options)), sealed.ciphertext, sealed.iv, keyHint(apiKey), makeDefault ? 1 : 0, now, now));
  await env.DB.batch(statements);
  return publicConnection(await env.DB.prepare("SELECT * FROM ai_connections WHERE id = ?").bind(id).first());
}

async function updateConnection(request, env, user, id) {
  const row = await loadConnection(env, user.id, id);
  const body = await readJson(request, 20000);
  const updates = { label: row.label, model: row.model, base_url: row.base_url, options_json: row.options_json, key_ciphertext: row.key_ciphertext, key_iv: row.key_iv, key_hint: row.key_hint };
  if (body.label !== undefined) updates.label = String(body.label || "").trim().slice(0, 60) || row.label;
  if (body.model !== undefined) updates.model = cleanModel(body.model);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (body.apiKey !== undefined && body.apiKey !== "" && !apiKey) throw new HttpError(400, "Paste a valid API key, or leave the key field empty to keep the saved one.");
  if (body.baseUrl !== undefined && row.provider === "compatible") {
    updates.base_url = cleanBaseUrl(env, body.baseUrl);
    // A saved key is only ever sent to the address it was saved for.
    if (updates.base_url !== row.base_url && !apiKey) throw new HttpError(400, "Enter the API key again when you change the base URL.");
  }
  if (body.options !== undefined) updates.options_json = JSON.stringify(cleanOptions(row.provider, body.options));
  if (apiKey) {
    requireEncryption(env);
    if (apiKey.length > 500) throw new HttpError(400, "Paste a valid API key.");
    const sealed = await encryptSecret(env, apiKey, `${user.id}:${row.id}`);
    Object.assign(updates, { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_hint: keyHint(apiKey) });
  }
  const statements = [];
  if (body.isDefault === true) statements.push(env.DB.prepare("UPDATE ai_connections SET is_default = 0 WHERE user_id = ?").bind(user.id));
  statements.push(env.DB.prepare("UPDATE ai_connections SET label = ?, model = ?, base_url = ?, options_json = ?, key_ciphertext = ?, key_iv = ?, key_hint = ?, is_default = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(updates.label, updates.model, updates.base_url, updates.options_json, updates.key_ciphertext, updates.key_iv, updates.key_hint, body.isDefault === true ? 1 : row.is_default, new Date().toISOString(), row.id, user.id));
  await env.DB.batch(statements);
  return publicConnection(await env.DB.prepare("SELECT * FROM ai_connections WHERE id = ?").bind(row.id).first());
}

async function deleteConnection(env, user, id) {
  const row = await loadConnection(env, user.id, id);
  await env.DB.prepare("DELETE FROM ai_connections WHERE id = ? AND user_id = ?").bind(row.id, user.id).run();
  if (row.is_default) {
    const next = await env.DB.prepare("SELECT id FROM ai_connections WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(user.id).first();
    if (next) await env.DB.prepare("UPDATE ai_connections SET is_default = 1 WHERE id = ?").bind(next.id).run();
  }
}

// ---------- provider calls ----------

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function providerBase(env, connection) {
  if (connection.provider === "compatible") return connection.baseUrl.replace(/\/+$/, "");
  const settings = PROVIDERS[connection.provider];
  return String(env[settings.env] || settings.base).replace(/\/+$/, "");
}

function redact(message, apiKey) {
  let text = String(message || "");
  if (apiKey) text = text.split(apiKey).join("[your key]");
  return text.replace(/\b(sk-[A-Za-z0-9_-]{3})[A-Za-z0-9_-]{8,}/g, "$1…").replace(/\bAIza[0-9A-Za-z_-]{10,}/g, "AIza…").slice(0, 400);
}

async function send(url, init, connection, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new ProviderError(502, error?.name === "AbortError" ? "The AI provider took too long to respond." : `Could not reach the AI provider (${redact(error?.message, connection.apiKey)}).`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    // Only structured provider errors are shown; raw pages from other servers are not echoed.
    const detail = (body && (body.error?.message || body.error?.status || (typeof body.error === "string" ? body.error : "") || body.message)) || response.statusText || "unexpected response";
    throw new ProviderError(response.status, `${PROVIDERS[connection.provider].label} returned ${response.status}: ${redact(detail, connection.apiKey)}`);
  }
  return body || {};
}

function extractJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ProviderError(502, "The AI did not return a JSON result. Try again or choose a different model.");
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new ProviderError(502, "The AI returned JSON that could not be read. Try again or choose a different model."); }
}

const schemaHint = schema => `\n\nReturn only one JSON object that matches this JSON Schema exactly. Do not wrap it in Markdown.\n${JSON.stringify(schema)}`;

// Try the provider's strictest structured-output mode first, then fall back to looser
// modes when a model or service rejects the request format (HTTP 400/422).
async function withFallbacks(strategies) {
  let lastError;
  for (const strategy of strategies) {
    try { return await strategy(); } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderError) || ![400, 422].includes(error.status)) throw error;
    }
  }
  throw lastError;
}

async function callOpenAI(env, connection, request) {
  const url = `${providerBase(env, connection)}/responses`;
  const headers = { Authorization: `Bearer ${connection.apiKey}`, "Content-Type": "application/json" };
  const attempt = async (format, extraInstructions = "") => {
    const body = { model: connection.model, instructions: request.system + extraInstructions, input: request.user, max_output_tokens: request.maxTokens, store: false, text: { format } };
    if (connection.options?.reasoningEffort) body.reasoning = { effort: connection.options.reasoningEffort };
    const result = await send(url, { method: "POST", headers, body: JSON.stringify(body) }, connection);
    if (result.status === "incomplete") throw new ProviderError(502, `The model stopped early (${result.incomplete_details?.reason || "incomplete"}). Try a lower reasoning effort or another model.`);
    let text = typeof result.output_text === "string" ? result.output_text : "";
    if (!text) for (const item of result.output || []) for (const content of item.content || []) if (!text && (content.type === "output_text" || content.type === "text") && content.text) text = content.text;
    if (!text) for (const item of result.output || []) for (const content of item.content || []) if (content.type === "refusal") throw new ProviderError(502, `The model declined: ${content.refusal}`);
    return { result: extractJson(text), usage: { input_tokens: result.usage?.input_tokens || 0, output_tokens: result.usage?.output_tokens || 0 } };
  };
  return withFallbacks([
    () => attempt({ type: "json_schema", name: request.schemaName, strict: true, schema: request.schema }),
    () => attempt({ type: "json_object" }, schemaHint(request.schema)),
    () => attempt({ type: "text" }, schemaHint(request.schema))
  ]);
}

async function callCompatible(env, connection, request) {
  const url = `${providerBase(env, connection)}/chat/completions`;
  const headers = { Authorization: `Bearer ${connection.apiKey}`, "Content-Type": "application/json" };
  const attempt = async (responseFormat, extraInstructions = "") => {
    const body = { model: connection.model, messages: [{ role: "system", content: request.system + extraInstructions }, { role: "user", content: request.user }], max_tokens: request.maxTokens };
    if (responseFormat) body.response_format = responseFormat;
    const result = await send(url, { method: "POST", headers, body: JSON.stringify(body) }, connection);
    const choice = result.choices?.[0];
    if (choice?.finish_reason === "length") throw new ProviderError(502, "The model ran out of output tokens. Try another model.");
    const content = choice?.message?.content;
    const text = Array.isArray(content) ? content.map(part => part?.text || "").join("") : content;
    if (choice?.message?.refusal && !text) throw new ProviderError(502, `The model declined: ${choice.message.refusal}`);
    return { result: extractJson(text), usage: { input_tokens: result.usage?.prompt_tokens || 0, output_tokens: result.usage?.completion_tokens || 0 } };
  };
  return withFallbacks([
    () => attempt({ type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: request.schema } }),
    () => attempt({ type: "json_object" }, schemaHint(request.schema)),
    () => attempt(null, schemaHint(request.schema))
  ]);
}

async function callAnthropic(env, connection, request) {
  const url = `${providerBase(env, connection)}/messages`;
  const headers = { "x-api-key": connection.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
  const usage = result => ({ input_tokens: result.usage?.input_tokens || 0, output_tokens: result.usage?.output_tokens || 0 });
  const viaTool = async maxTokens => {
    const body = {
      model: connection.model, max_tokens: maxTokens, system: request.system,
      messages: [{ role: "user", content: request.user }],
      tools: [{ name: request.schemaName, description: "Record the complete result in this exact structure.", input_schema: request.schema }],
      tool_choice: { type: "tool", name: request.schemaName }
    };
    const result = await send(url, { method: "POST", headers, body: JSON.stringify(body) }, connection);
    if (result.stop_reason === "max_tokens") throw new ProviderError(502, "The model ran out of output tokens. Try another model.");
    const block = (result.content || []).find(item => item.type === "tool_use");
    if (!block?.input || typeof block.input !== "object") throw new ProviderError(502, "The model did not return a structured result.");
    return { result: block.input, usage: usage(result) };
  };
  const viaText = async maxTokens => {
    const body = { model: connection.model, max_tokens: maxTokens, system: request.system + schemaHint(request.schema), messages: [{ role: "user", content: request.user }] };
    const result = await send(url, { method: "POST", headers, body: JSON.stringify(body) }, connection);
    const text = (result.content || []).filter(item => item.type === "text").map(item => item.text).join("");
    return { result: extractJson(text), usage: usage(result) };
  };
  // Older models accept fewer output tokens; retry with a smaller ceiling if needed.
  const withTokenRetry = method => async () => {
    try { return await method(request.maxTokens); } catch (error) {
      if (error instanceof ProviderError && error.status === 400 && /max_tokens/i.test(error.message) && request.maxTokens > 4096) return method(4096);
      throw error;
    }
  };
  return withFallbacks([withTokenRetry(viaTool), withTokenRetry(viaText)]);
}

async function callGemini(env, connection, request) {
  const model = encodeURIComponent(connection.model.replace(/^models\//, ""));
  const url = `${providerBase(env, connection)}/models/${model}:generateContent`;
  const headers = { "x-goog-api-key": connection.apiKey, "Content-Type": "application/json" };
  const attempt = async useSchema => {
    const generationConfig = { responseMimeType: "application/json", maxOutputTokens: request.maxTokens };
    if (useSchema) generationConfig.responseJsonSchema = request.schema;
    const body = { systemInstruction: { parts: [{ text: request.system + (useSchema ? "" : schemaHint(request.schema)) }] }, contents: [{ role: "user", parts: [{ text: request.user }] }], generationConfig };
    const result = await send(url, { method: "POST", headers, body: JSON.stringify(body) }, connection);
    if (result.promptFeedback?.blockReason) throw new ProviderError(502, `Gemini blocked the request (${result.promptFeedback.blockReason}).`);
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") throw new ProviderError(502, "The model ran out of output tokens. Try another model.");
    const text = (candidate?.content?.parts || []).filter(part => !part.thought).map(part => part.text || "").join("");
    const meta = result.usageMetadata || {};
    return { result: extractJson(text), usage: { input_tokens: meta.promptTokenCount || 0, output_tokens: (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0) } };
  };
  return withFallbacks([() => attempt(true), () => attempt(false)]);
}

export async function callProvider(env, connection, request) {
  const handler = { openai: callOpenAI, anthropic: callAnthropic, gemini: callGemini, compatible: callCompatible }[connection.provider];
  if (!handler) throw new HttpError(400, "Unsupported provider.");
  return handler(env, connection, request);
}

export async function listModels(env, connection) {
  const base = providerBase(env, connection);
  let models = [];
  if (connection.provider === "anthropic") {
    const result = await send(`${base}/models?limit=100`, { headers: { "x-api-key": connection.apiKey, "anthropic-version": "2023-06-01" } }, connection, 30000);
    models = (result.data || []).map(item => ({ id: item.id, name: item.display_name || item.id }));
  } else if (connection.provider === "gemini") {
    const result = await send(`${base}/models?pageSize=1000`, { headers: { "x-goog-api-key": connection.apiKey } }, connection, 30000);
    models = (result.models || []).filter(item => (item.supportedGenerationMethods || []).includes("generateContent")).map(item => ({ id: String(item.name || "").replace(/^models\//, ""), name: item.displayName || item.name }));
  } else {
    const result = await send(`${base}/models`, { headers: { Authorization: `Bearer ${connection.apiKey}` } }, connection, 30000);
    const list = Array.isArray(result) ? result : result.data || result.models || [];
    models = list.map(item => ({ id: String(item.id || item.name || ""), name: item.name || item.display_name || item.id }));
    if (connection.provider === "openai") models = models.filter(item => !NON_CHAT_MODEL.test(item.id));
  }
  return models.filter(item => item.id).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 500);
}

// ---------- task runner ----------

function shapeResult(task, result) {
  const value = result && typeof result === "object" && !Array.isArray(result) ? result : {};
  if (task === "practice_reply") {
    value.reply = String(value.reply || "");
    value.brief_correction = value.brief_correction && typeof value.brief_correction === "object" ? value.brief_correction : { original: "", better: "", reason: "" };
    value.target_observations = Array.isArray(value.target_observations) ? value.target_observations : [];
    value.should_end = Boolean(value.should_end);
  }
  if (task === "practice_start") {
    value.reply = String(value.reply || "");
    value.selected_target_ids = Array.isArray(value.selected_target_ids) ? value.selected_target_ids.map(String) : [];
  }
  return value;
}

async function runTask(request, env, user) {
  rateLimit(`ai:${user.id}`, Number(env.AI_REQUESTS_PER_HOUR) || 120);
  const body = await readJson(request, 250000);
  const task = String(body.task || "");
  const settings = AI_TASKS[task];
  if (!settings) throw new HttpError(400, "Unknown AI task.");
  const learner = cleanLearner(body.learner);
  let system;
  let userText;
  if (task.startsWith("practice_")) {
    const action = task.slice("practice_".length);
    const session = cleanSession({ ...(body.session || {}), learner });
    if (!session.id) throw new HttpError(400, "Missing practice session ID.");
    if (action !== "start" && !session.messages.some(message => message.role === "user")) throw new HttpError(400, "Add a learner response first.");
    system = practiceInstructions(action, session);
    userText = practiceTask(action, session);
  } else {
    userText = String(body.prompt || "").slice(0, 60000);
    if (!userText.trim()) throw new HttpError(400, "Missing review request.");
    system = reviewSystemPrompt(task, learner);
  }
  const row = await loadConnection(env, user.id, body.connectionId ? String(body.connectionId) : "");
  const connection = await connectionWithKey(env, user.id, row);
  try {
    const output = await callProvider(env, connection, { system, user: userText, schema: settings.schema, schemaName: settings.name, maxTokens: settings.maxTokens });
    return json({ result: shapeResult(task, output.result), usage: output.usage, provider: row.provider, model: row.model, connection: row.label });
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(502, error.message);
    throw error;
  }
}

async function modelsForRequest(request, env, user) {
  rateLimit(`models:${user.id}`, 60);
  const body = await readJson(request, 20000);
  let connection;
  if (body.connectionId) connection = await connectionWithKey(env, user.id, await loadConnection(env, user.id, String(body.connectionId)));
  else {
    const provider = String(body.provider || "");
    if (!PROVIDERS[provider]) throw new HttpError(400, "Choose a supported provider.");
    const apiKey = String(body.apiKey || "").trim();
    if (!apiKey) throw new HttpError(400, "Paste your API key first.");
    connection = { provider, apiKey, baseUrl: provider === "compatible" ? cleanBaseUrl(env, body.baseUrl) : "", model: "", options: {} };
  }
  try {
    return json({ models: await listModels(env, connection) });
  } catch (error) {
    if (error instanceof ProviderError) throw new HttpError(502, error.message);
    throw error;
  }
}

async function testConnection(env, user, id) {
  rateLimit(`ai:${user.id}`, Number(env.AI_REQUESTS_PER_HOUR) || 120);
  const row = await loadConnection(env, user.id, id);
  const connection = await connectionWithKey(env, user.id, row);
  const schema = { type: "object", additionalProperties: false, required: ["reply"], properties: { reply: { type: "string" } } };
  try {
    const output = await callProvider(env, connection, { system: "You are a connection test. Return a JSON object.", user: 'Return {"reply":"ok"}.', schema, schemaName: "connection_test", maxTokens: 2000 });
    return json({ ok: true, reply: String(output.result?.reply || "").slice(0, 60), usage: output.usage, model: row.model });
  } catch (error) {
    if (error instanceof ProviderError) return json({ ok: false, error: error.message }, 200);
    throw error;
  }
}

export async function handleAiRoute(request, env, url, user) {
  requireSameOrigin(request, url);
  const path = url.pathname;
  if (path === "/api/ai/connections" && request.method === "GET") return json({ connections: (await listConnections(env, user.id)).map(publicConnection), encryptionReady: encryptionConfigured(env) });
  if (path === "/api/ai/connections" && request.method === "POST") return json({ connection: await createConnection(request, env, user) }, 201);
  if (path === "/api/ai/models" && request.method === "POST") return modelsForRequest(request, env, user);
  if (path === "/api/ai/run" && request.method === "POST") return runTask(request, env, user);
  const match = path.match(/^\/api\/ai\/connections\/([0-9a-f-]{36})(\/test)?$/);
  if (match && match[2] && request.method === "POST") return testConnection(env, user, match[1]);
  if (match && !match[2] && request.method === "PATCH") return json({ connection: await updateConnection(request, env, user, match[1]) });
  if (match && !match[2] && request.method === "DELETE") {
    await deleteConnection(env, user, match[1]);
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found.");
}
