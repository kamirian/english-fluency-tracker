// Local stand-in for AI providers, used only by the automated tests.
import http from "node:http";

const PORT = Number(process.env.MOCK_AI_PORT || 8790);
const log = [];
let googleUser = "learner@example.com";

function detectTask(text) {
  const value = String(text || "");
  if (value.includes("connection_test") || value.includes("connection test")) return "test";
  if (value.includes("selected_target_ids") || value.includes("practice_start")) return "start";
  if (value.includes("should_end") || value.includes("practice_reply")) return "reply";
  if (value.includes("spelling_mistakes") || value.includes("practice_evaluation")) return "evaluate";
  if (value.includes("writing_review_version") || value.includes("writing_review")) return "writing";
  if (value.includes("activity_review_version") || value.includes("activity_review")) return "activity";
  if (value.includes("review_version") || value.includes("library_review")) return "library";
  return "test";
}

function sample(task, context) {
  const ids = [...String(context).matchAll(/\[([0-9a-f-]{36})\]/g)].map(match => match[1]);
  if (task === "start") return { reply: "Mock coach: Tell me about a decision you made this week.", selected_target_ids: ids.slice(0, 2) };
  if (task === "reply") return { reply: "Mock coach: Interesting! What happened next?", brief_correction: { original: "", better: "", reason: "" }, target_observations: [], should_end: false };
  if (task === "evaluate") return {
    scores: { naturalness: 82, grammar_accuracy: 78, vocabulary_range: 80, task_completion: 90, target_usage: 70, overall: 81 },
    summary: "Mock review: clear and natural overall.", strengths: ["Good follow-up questions"],
    priority_corrections: [{ original: "I am agree", corrected: "I agree", explanation: "Agree is a verb." }],
    spelling_mistakes: [{ original: "recieve", correct: "receive", meaning: "to get something", example: "I receive emails daily.", evidence: "I recieve emails" }],
    target_results: [], proposed_items: [{ type: "grammar", front: "agree (verb)", back: "Say I agree, not I am agree.", example: "I agree with you.", reason: "Recurring error" }],
    next_focus: "Practice agree/disagree phrases."
  };
  if (task === "library") {
    const libraryIds = [...String(context).matchAll(/"id":\s*"([^"]+)"/g)].map(match => match[1]);
    return { review_version: 1, reviews: libraryIds.map(id => ({ id, verdict: "minor", corrected_example: "Mock corrected example sentence.", explanation: "Mock explanation.", new_items: [{ type: "collocation", front: `mock item ${id.slice(0, 4)}`, back: "mock meaning", example: "Mock example." }] })) };
  }
  if (task === "writing") {
    const date = String(context).match(/"date":\s*"(\d{4}-\d{2}-\d{2})"/)?.[1] || "2026-01-01";
    return { writing_review_version: 1, date, corrected_text: "Mock corrected text.", overall_feedback: "Mock writing feedback.", key_corrections: [{ category: "grammar", original: "a", corrected: "b", explanation: "c" }], target_results: [], reusable_items: [{ type: "vocabulary", front: "mock writing word", back: "meaning", example: "example" }] };
  }
  if (task === "activity") {
    const id = String(context).match(/"id":\s*"([^"]+)"/)?.[1] || "";
    return { activity_review_version: 1, session_id: id, overall_feedback: "Mock activity feedback.", corrected_evidence: "Mock corrected summary.", understanding_notes: "Understood well.", phrase_corrections: [], pronunciation_notes: "Not assessed.", reusable_items: [] };
  }
  return { reply: "ok" };
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const entry = { method: req.method, path: url.pathname, auth: req.headers.authorization || req.headers["x-api-key"] || req.headers["x-goog-api-key"] || "", format: body.text?.format?.type || body.response_format?.type || (body.tools ? "tool" : "") || (body.generationConfig?.responseJsonSchema ? "json_schema" : body.generationConfig ? "json_mode" : ""), model: body.model || url.pathname.split("/models/")[1] || "" };
  if (url.pathname === "/__log") return send(res, 200, log);
  if (url.pathname === "/__reset") { log.length = 0; return send(res, 200, { ok: true }); }
  if (url.pathname === "/__google_user") { googleUser = url.searchParams.get("email") || googleUser; return send(res, 200, { googleUser }); }
  if (url.pathname === "/google/auth") {
    const target = new URL(url.searchParams.get("redirect_uri"));
    target.searchParams.set("code", googleUser);
    target.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }
  if (url.pathname === "/google/token") {
    const form = new URLSearchParams(raw);
    const email = form.get("code");
    if (!form.get("code_verifier") || form.get("client_secret") !== "test-secret") return send(res, 400, { error: "invalid_grant" });
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const idToken = [encode({ alg: "RS256" }), encode({ iss: "https://accounts.google.com", aud: form.get("client_id"), sub: `google-${email}`, email, email_verified: true, name: email.split("@")[0], exp: Math.floor(Date.now() / 1000) + 3600 }), "sig"].join(".");
    return send(res, 200, { id_token: idToken, access_token: "x", token_type: "Bearer" });
  }
  if (url.pathname.startsWith("/html/")) { res.writeHead(500, { "Content-Type": "text/html" }); return res.end("<html>internal page body: secret-ish admin data</html>"); }
  log.push(entry);
  const key = entry.auth.replace(/^Bearer /, "");
  if (!key.startsWith("sk-test") && !key.startsWith("AIzaTest")) return send(res, 401, { error: { message: `Incorrect API key provided: ${key}` } });

  if (url.pathname.endsWith("/models") && req.method === "GET") {
    if (url.pathname.startsWith("/gemini")) return send(res, 200, { models: [{ name: "models/gemini-test", displayName: "Gemini Test", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-test", supportedGenerationMethods: ["embedContent"] }] });
    if (url.pathname.startsWith("/anthropic")) return send(res, 200, { data: [{ id: "claude-test", display_name: "Claude Test" }] });
    return send(res, 200, { data: [{ id: "gpt-test" }, { id: "text-embedding-test" }, { id: "no-schema-model" }] });
  }
  if (body.model === "gpt-slow") await new Promise(resolve => setTimeout(resolve, 2500));
  if (url.pathname === "/openai/v1/responses") {
    const task = detectTask(`${body.text?.format?.name || ""} ${body.instructions}`);
    return send(res, 200, { status: "completed", output_text: JSON.stringify(sample(task, `${body.instructions}\n${body.input}`)), usage: { input_tokens: 120, output_tokens: 40 } });
  }
  if (url.pathname === "/compat/v1/chat/completions") {
    if (body.model === "no-schema-model" && body.response_format?.type === "json_schema") return send(res, 400, { error: { message: "response_format json_schema is not supported for this model" } });
    const system = body.messages?.[0]?.content || "";
    const task = detectTask(`${body.response_format?.json_schema?.name || ""} ${system}`);
    return send(res, 200, { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "```json\n" + JSON.stringify(sample(task, `${system}\n${body.messages?.[1]?.content}`)) + "\n```" } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
  }
  if (url.pathname === "/anthropic/v1/messages") {
    const task = detectTask(`${body.tools?.[0]?.name || ""} ${body.system}`);
    return send(res, 200, { stop_reason: "tool_use", content: [{ type: "tool_use", name: body.tools?.[0]?.name, input: sample(task, `${body.system}\n${body.messages?.[0]?.content}`) }], usage: { input_tokens: 90, output_tokens: 25 } });
  }
  const gemini = url.pathname.match(/^\/gemini\/v1beta\/models\/([^:]+):generateContent$/);
  if (gemini) {
    if (gemini[1] === "gemini-old" && body.generationConfig?.responseJsonSchema) return send(res, 400, { error: { message: "Invalid JSON payload received. Unknown name \"responseJsonSchema\"", status: "INVALID_ARGUMENT" } });
    const system = body.systemInstruction?.parts?.[0]?.text || "";
    const task = detectTask(`${JSON.stringify(body.generationConfig?.responseJsonSchema || "")} ${system}`);
    return send(res, 200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(sample(task, `${system}\n${body.contents?.[0]?.parts?.[0]?.text}`)) }] } }], usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 20, thoughtsTokenCount: 5 } });
  }
  send(res, 404, { error: { message: "mock: unknown route" } });
}).listen(PORT, () => console.log(`mock AI listening on ${PORT}`));
