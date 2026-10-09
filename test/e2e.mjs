// Browser checks against a running `wrangler dev` (DEV_LOGIN=true) and test/mock-ai.mjs.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const RUN = Date.now().toString(36);
const results = [];
const errors = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message.split("\n")[0]}`); } };

const browser = await chromium.launch();
async function newPage(context, label) {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${label}: ${error.message}`));
  page.on("console", message => { if (message.type() === "error" && !/401|404|Failed to load resource/.test(message.text())) errors.push(`${label} console: ${message.text()}`); });
  page.on("dialog", dialog => dialog.type() === "prompt" ? dialog.accept("DELETE") : dialog.accept());
  return page;
}
const tab = async (page, id) => { await page.click(`.jump-nav [data-tab="${id}"]`); await page.waitForTimeout(150); };
const clipboard = page => page.evaluate(() => navigator.clipboard.readText());
const toast = page => page.locator("#toast").textContent();

const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await desktop.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await newPage(desktop, "desktop");
await page.goto(BASE);
await page.waitForTimeout(800);

await check("signed out: settings shows sign-in options, AI buttons disabled", async () => {
  assert.equal(await page.locator("#syncButtonLabel").textContent(), "Sign in");
  await tab(page, "settings");
  assert.ok(await page.locator("#googleSignInBtn").isVisible());
  assert.ok(await page.locator("#devSignInBtn").isVisible());
  assert.ok(await page.locator("#aiSignedOutNote").isVisible());
  assert.ok(await page.locator("#aiReviewBtn").isDisabled());
  assert.equal(await page.locator("#startPracticeBtn").textContent(), "Copy practice prompt");
});

await check("signed out: add device-only library item", async () => {
  await tab(page, "library");
  await page.selectOption("#libraryType", "collocation");
  await page.fill("#libraryFront", "make a decision");
  await page.fill("#libraryBack", "to decide something");
  await page.fill("#libraryExample", "I made a decision to move.");
  await page.click("#librarySaveBtn");
  await page.waitForTimeout(200);
  assert.match(await page.locator("#libraryCount").textContent(), /1 item/);
});

await check("copy-and-paste practice: prompt → JSON with transcript → applied", async () => {
  await tab(page, "practice");
  await page.click("#copyPracticePromptBtn");
  await page.waitForTimeout(300);
  const promptText = await clipboard(page);
  assert.match(promptText, /FINISH/);
  assert.match(promptText, /make a decision/);
  const sessionId = promptText.match(/"session_id": "([^"]+)"/)[1];
  const payload = { practice_review_version: 1, session_id: sessionId, scores: { naturalness: 8, grammar_accuracy: 7, vocabulary_range: 8, task_completion: 9, target_usage: 6, overall: 8 }, summary: "Nice work.", strengths: ["Clear"], priority_corrections: [{ original: "I am agree", corrected: "I agree", explanation: "verb" }], spelling_mistakes: [{ original: "becuase", correct: "because", meaning: "for the reason that", example: "I stayed because it rained.", evidence: "becuase" }], target_results: [], proposed_items: [{ type: "grammar", front: "agree is a verb", back: "Say I agree.", example: "I agree.", reason: "recurring" }], next_focus: "Agreeing politely.", transcript: [{ role: "coach", content: "What did you decide?" }, { role: "learner", content: "I am agree to move becuase of work." }] };
  await page.fill("#practiceReviewPackage", "```json\n" + JSON.stringify(payload) + "\n```");
  await page.click("#applyPracticeReviewBtn");
  await page.waitForTimeout(400);
  assert.match(await page.locator("#practiceReview").textContent(), /Practice review/);
  assert.match(await page.locator("#practiceReview").textContent(), /80/, "10-point scores scaled to 100");
  assert.match(await page.locator("#practiceChat").textContent(), /I am agree to move/);
  await tab(page, "library");
  assert.match(await page.locator("#libraryCount").textContent(), /2 items/);
  await tab(page, "spelling");
  assert.match(await page.locator("#spellingTroubleList").textContent(), /because/);
});

await check("copy-and-paste library review", async () => {
  await tab(page, "library");
  await page.click("#selectVisibleReviewBtn");
  await page.click("#copyReviewBtn");
  await page.waitForTimeout(300);
  const promptText = await clipboard(page);
  const ids = [...promptText.matchAll(/"id": "([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length >= 1);
  await page.fill("#reviewPackageInput", JSON.stringify({ review_version: 1, reviews: ids.map(id => ({ id, verdict: "correct", corrected_example: "I made a decision to move.", explanation: "Natural.", new_items: [] })) }));
  await page.click("#applyReviewBtn");
  await page.waitForTimeout(300);
  assert.match(await page.locator("#reviewApplyState").textContent(), /Applied/);
});

await check("dev sign-in merges device progress into the account", async () => {
  await page.goto(`${BASE}/auth/dev-login?email=alice-${RUN}@example.com&name=Alice&return=settings`);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#accountEmail").textContent(), `alice-${RUN}@example.com`);
  assert.match(await page.locator("#syncButtonLabel").textContent(), /Synced/);
  await tab(page, "library");
  assert.match(await page.locator("#libraryCount").textContent(), /2 items/);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.ok(!keys.includes("english-fluency-tracker-v1"), "device copy moved into the account");
  assert.ok(keys.some(key => key.startsWith("english-fluency-tracker-v1:account:")));
});

await check("connect an AI through Settings (load models, save, test)", async () => {
  await tab(page, "settings");
  await page.selectOption("#aiProvider", "openai");
  assert.ok(!(await page.locator("#aiBaseUrlField").isVisible()), "base URL hidden for OpenAI");
  assert.ok(!(await page.locator("#aiPresetField").isVisible()), "service preset hidden for OpenAI");
  assert.ok(await page.locator("#aiEffortField").isVisible());
  assert.ok(!(await page.locator("#devSignInBtn").isVisible()) && !(await page.locator("#googleSignInBtn").isVisible()), "sign-in buttons hidden when signed in");
  await page.fill("#aiApiKey", "sk-test-openai-1234567890");
  await page.click("#aiLoadModelsBtn");
  await page.waitForFunction(() => document.querySelectorAll("#aiModelOptions option").length > 0);
  const options = await page.$$eval("#aiModelOptions option", nodes => nodes.map(node => node.value));
  assert.ok(options.includes("gpt-test") && !options.some(value => value.includes("embedding")));
  await page.fill("#aiModel", "gpt-test");
  await page.selectOption("#aiEffort", "low");
  await page.click("#aiSaveBtn");
  await page.waitForFunction(() => /Connected/.test(document.querySelector("#aiState").textContent), null, { timeout: 8000 });
  assert.match(await page.locator("#aiConnectionList").textContent(), /In use/);
  assert.equal(await page.inputValue("#aiApiKey"), "");
  assert.ok(!(await page.content()).includes("sk-test-openai-1234567890"));
});

await check("second connection (OpenAI-compatible preset) and switching", async () => {
  await page.selectOption("#aiProvider", "compatible");
  assert.ok(await page.locator("#aiBaseUrlField").isVisible());
  assert.ok(!(await page.locator("#aiEffortField").isVisible()), "effort only for OpenAI");
  assert.equal(await page.inputValue("#aiBaseUrl"), "https://openrouter.ai/api/v1");
  await page.selectOption("#aiPreset", "");
  await page.fill("#aiBaseUrl", "http://127.0.0.1:8790/compat/v1");
  await page.fill("#aiApiKey", "sk-test-compat-xyz12345");
  await page.fill("#aiModel", "no-schema-model");
  await page.fill("#aiLabel", "Compat test");
  await page.click("#aiSaveBtn");
  await page.waitForFunction(() => /Connected/.test(document.querySelector("#aiState").textContent), null, { timeout: 8000 });
  assert.equal(await page.locator(".ai-connection").count(), 2);
  await page.locator('.ai-connection:not(.default) [data-ai-conn="default"]').click();
  await page.waitForTimeout(600);
  assert.match(await page.locator(".ai-connection.default").textContent(), /gpt-test/);
});

await check("AI buttons: library, writing, activity reviews", async () => {
  await tab(page, "library");
  await page.click("#libraryCancelBtn").catch(() => {});
  await page.fill("#libraryFront", "figure out");
  await page.selectOption("#libraryType", "phrasal_verb");
  await page.fill("#libraryBack", "to understand");
  await page.fill("#libraryExample", "I figured out it.");
  await page.click("#librarySaveBtn");
  await page.waitForTimeout(200);
  await page.click("#selectVisibleReviewBtn");
  assert.ok(await page.locator("#aiReviewBtn").isEnabled());
  await page.click("#aiReviewBtn");
  await page.waitForFunction(() => /Applied/.test(document.querySelector("#reviewApplyState").textContent), null, { timeout: 8000 });
  await tab(page, "writing");
  await page.fill("#writingPrompt", "Describe your week.");
  await page.fill("#writingDraft", "This week I have went to the park.");
  await page.click("#aiWritingReviewBtn");
  await page.waitForFunction(() => /Mock writing feedback/.test(document.querySelector("#writingFeedback").textContent), null, { timeout: 8000 });
  await tab(page, "sessions");
  await page.fill("#sessionSource", "Podcast episode");
  await page.fill("#sessionEvidence", "They talked about habits.");
  await page.click("#aiSessionReviewBtn");
  await page.waitForFunction(() => /Mock activity feedback/.test(document.querySelector("#sessionFeedback").textContent), null, { timeout: 8000 });
});

await check("live practice: start, reply, finish & score", async () => {
  await tab(page, "practice");
  assert.equal(await page.locator("#startPracticeBtn").textContent(), "Start practice");
  assert.match(await page.locator("#practiceApiStatus").textContent(), /Live practice with/);
  await page.click("#resetPracticeBtn");
  await page.click("#startPracticeBtn");
  await page.waitForFunction(() => /Mock coach/.test(document.querySelector("#practiceChat").textContent), null, { timeout: 8000 });
  await page.fill("#practiceInput", "I decided to change jobs last month.");
  await page.click("#sendPracticeBtn");
  await page.waitForFunction(() => /What happened next/.test(document.querySelector("#practiceChat").textContent), null, { timeout: 8000 });
  await page.click("#finishPracticeBtn");
  await page.waitForFunction(() => /Mock review/.test(document.querySelector("#practiceReview").textContent), null, { timeout: 8000 });
  assert.match(await page.locator("#practiceCost").textContent(), /Tokens used: \d/);
});

await check("profile changes variety across UI, prompts, and handoff", async () => {
  await tab(page, "settings");
  await page.fill("#profileName", "Alice");
  await page.selectOption("#profileVariety", "British English");
  await page.fill("#profileGoals", "Sound natural in meetings.");
  await page.click('#profileForm button[type="submit"]');
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#varietyEyebrow").textContent(), "Natural British English");
  await tab(page, "handoff");
  const handoff = await page.inputValue("#handoffPreview");
  assert.match(handoff, /Learner: Alice/);
  assert.match(handoff, /British English/);
  assert.ok(!/Kiyan|IELTS/.test(handoff));
  await tab(page, "writing");
  await page.click("#copyWritingReviewBtn");
  await page.waitForTimeout(300);
  assert.match(await clipboard(page), /natural, educated British English/);
});

await check("progress Year view renders without errors", async () => {
  const before = errors.length;
  await tab(page, "progress");
  await page.click('[data-calendar-view="year"]');
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".hist-column").count(), 12);
  assert.equal(errors.length, before, errors.slice(before).join(" | "));
});

await check("same account on a second device sees synced data", async () => {
  await page.waitForTimeout(1500);
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const second = await newPage(other, "second-device");
  await second.goto(`${BASE}/auth/dev-login?email=alice-${RUN}@example.com&return=library`);
  await second.waitForTimeout(1800);
  assert.match(await second.locator("#libraryCount").textContent(), /items/);
  const count = Number((await second.locator("#libraryCount").textContent()).match(/\d+/)[0]);
  assert.ok(count >= 4, `expected ≥4 items, got ${count}`);
  await second.click('.jump-nav [data-tab="settings"]');
  assert.equal(await second.inputValue("#profileName"), "Alice");
  await other.close();
});

await check("backup export downloads the tracker", async () => {
  await tab(page, "settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportBackupBtn")]);
  assert.match(download.suggestedFilename(), /english-fluency-backup-\d{4}-\d{2}-\d{2}\.json/);
  const path = await download.path();
  const { readFileSync, writeFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(data.format, "english-fluency-tracker-backup");
  writeFileSync("test/output/backup.json", JSON.stringify(data));
});

await check("sign out removes the account copy; another user sees nothing of it", async () => {
  await tab(page, "settings");
  await page.click("#signOutBtn");
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("#syncButtonLabel").textContent(), "Sign in");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.ok(!keys.some(key => key.includes(":account:")), keys.join(","));
  await tab(page, "library");
  assert.match(await page.locator("#libraryCount").textContent(), /^0 items/);
  await page.goto(`${BASE}/auth/dev-login?email=bob-${RUN}@example.com&name=Bob&return=library`);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#libraryCount").textContent(), "0 items");
  await page.click('.jump-nav [data-tab="settings"]');
  assert.equal(await page.locator(".ai-connection").count(), 0);
  assert.ok(await page.locator("#aiReviewBtn").isDisabled());
});

await check("backup import merges into bob's tracker", async () => {
  await page.setInputFiles("#importBackupInput", "test/output/backup.json");
  await page.waitForTimeout(600);
  assert.match(await page.locator("#backupState").textContent(), /merged/);
  await tab(page, "library");
  assert.ok(Number((await page.locator("#libraryCount").textContent()).match(/\d+/)[0]) >= 4);
});

await check("delete account", async () => {
  await tab(page, "settings");
  await page.locator(".danger-zone summary").click();
  await page.click("#deleteAccountBtn");
  await page.waitForTimeout(1200);
  assert.ok(await page.locator("#signedOutBlock").isVisible());
  const me = await page.evaluate(() => fetch("/api/me").then(response => response.json()));
  assert.equal(me.signedIn, false);
});

// Mobile layout: every tab, no horizontal scrolling.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await newPage(mobile, "mobile");
await phone.goto(`${BASE}/auth/dev-login?email=mobile-${RUN}@example.com&return=today`);
await phone.waitForTimeout(1200);
await check("mobile: all tabs fit without horizontal overflow", async () => {
  const overflows = [];
  for (const id of ["today", "practice", "schedule", "sessions", "library", "writing", "study", "spelling", "progress", "handoff", "settings"]) {
    await phone.evaluate(tabId => window.openTrackerTab(tabId), id);
    await phone.waitForTimeout(150);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) overflows.push(`${id}:${overflow}`);
  }
  assert.equal(overflows.length, 0, overflows.join(", "));
});
await phone.evaluate(() => window.openTrackerTab("settings"));
await phone.screenshot({ path: "test/output/mobile-settings.png", fullPage: true });
await phone.evaluate(() => window.openTrackerTab("practice"));
await phone.screenshot({ path: "test/output/mobile-practice.png", fullPage: true });
const shotPage = await newPage(desktop, "desktop-shot");
await shotPage.goto(`${BASE}/auth/dev-login?email=shots-${RUN}@example.com&return=settings`);
await shotPage.waitForTimeout(1200);
await shotPage.screenshot({ path: "test/output/desktop-settings.png", fullPage: true });
await shotPage.evaluate(() => window.openTrackerTab("practice"));
await shotPage.screenshot({ path: "test/output/desktop-practice.png", fullPage: false });

// Two tabs in one browser: a stale tab must never sync into a different account.
await check("stale tab never leaks into the account signed in elsewhere", async () => {
  const shared = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tabA = await newPage(shared, "tabA");
  await tabA.goto(`${BASE}/auth/dev-login?email=carol-${RUN}@example.com&return=library`);
  await tabA.waitForTimeout(1500);
  await tabA.selectOption("#libraryType", "vocabulary");
  await tabA.fill("#libraryFront", `CAROL-PRIVATE-${RUN}`);
  await tabA.fill("#libraryBack", "private");
  await tabA.click("#librarySaveBtn");
  await tabA.waitForTimeout(1800);
  const tabB = await newPage(shared, "tabB");
  await tabB.goto(`${BASE}/#settings`);
  await tabB.waitForTimeout(1500);
  await tabB.click("#signOutBtn");
  await tabB.waitForTimeout(1200);
  await tabB.goto(`${BASE}/auth/dev-login?email=dave-${RUN}@example.com&return=library`);
  await tabB.waitForTimeout(1800);
  await tabA.bringToFront();
  await tabA.evaluate(() => window.openTrackerTab("library"));
  await tabA.fill("#libraryFront", `TAB-A-EDIT-${RUN}`);
  await tabA.fill("#libraryBack", "edit made in the stale tab");
  await tabA.click("#librarySaveBtn");
  await tabA.waitForTimeout(3000);
  const daveCloud = await tabB.evaluate(() => fetch("/api/sync").then(response => response.json()));
  assert.ok(!JSON.stringify(daveCloud.state || {}).includes("CAROL-PRIVATE"), "Dave's cloud copy contains Carol's item");
  assert.equal(await tabA.locator("#accountEmail").textContent(), `dave-${RUN}@example.com`, "stale tab switched to the signed-in account");
  assert.ok(!(await tabA.locator("#libraryList").textContent()).includes("CAROL-PRIVATE"));
  const carolCache = await tabA.evaluate(() => Object.entries(localStorage).filter(([key, value]) => value.includes("CAROL-PRIVATE")).map(([key]) => key));
  assert.equal(carolCache.length, 0, `Carol's data still cached under ${carolCache.join(",")}`);
  await shared.close();
});

await check("sync reply that arrives after sign-out in another tab is discarded", async () => {
  const shared = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tabA = await newPage(shared, "late-sync-A");
  await tabA.goto(`${BASE}/auth/dev-login?email=gina-${RUN}@example.com&return=library`);
  await tabA.waitForTimeout(1500);
  await tabA.fill("#libraryFront", `GINA-PRIVATE-${RUN}`);
  await tabA.fill("#libraryBack", "private");
  await tabA.click("#librarySaveBtn");
  await tabA.waitForTimeout(1800);
  // The server answers with Gina's data, but the reply reaches the tab only after the sign-out.
  await tabA.route("**/api/sync", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 4000));
    await route.fulfill({ response });
  });
  await tabA.evaluate(() => window.openTrackerTab("settings"));
  await tabA.click("#syncNowBtn");
  await tabA.waitForTimeout(300);
  const tabB = await newPage(shared, "late-sync-B");
  await tabB.goto(`${BASE}/#settings`);
  await tabB.waitForTimeout(800);
  await tabB.click("#signOutBtn");
  await tabA.waitForTimeout(5500);
  const leaked = await tabA.evaluate(() => Object.entries(localStorage).filter(([, value]) => value.includes("GINA-PRIVATE")).map(([key]) => key));
  assert.equal(leaked.length, 0, `found in ${leaked.join(",")}`);
  assert.ok(!(await tabA.locator("#libraryList").textContent()).includes("GINA-PRIVATE"));
  await shared.close();
});

await check("AI reply that arrives after sign-out is discarded", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const slow = await newPage(ctx, "slow");
  await slow.goto(`${BASE}/auth/dev-login?email=erin-${RUN}@example.com&return=settings`);
  await slow.waitForTimeout(1500);
  await slow.selectOption("#aiProvider", "openai");
  await slow.fill("#aiApiKey", "sk-test-openai-1234567890");
  await slow.fill("#aiModel", "gpt-slow");
  await slow.click("#aiSaveBtn");
  await slow.waitForFunction(() => /Connected/.test(document.querySelector("#aiState").textContent), null, { timeout: 10000 });
  await slow.evaluate(() => window.openTrackerTab("practice"));
  await slow.fill("#practiceCustomTopic", `ERIN-TOPIC-${RUN}`);
  await slow.click("#startPracticeBtn");
  await slow.waitForTimeout(300);
  await slow.evaluate(() => window.openTrackerTab("settings"));
  await slow.click("#signOutBtn");
  await slow.waitForTimeout(3500);
  const leaked = await slow.evaluate(() => Object.entries(localStorage).filter(([, value]) => value.includes("ERIN-TOPIC")).map(([key]) => key));
  assert.equal(leaked.length, 0, `found in ${leaked.join(",")}`);
  assert.ok(!(await slow.locator("#practiceChat").textContent()).includes("Mock coach"));
  await ctx.close();
});

await check("no page errors anywhere", async () => assert.equal(errors.length, 0, errors.join(" | ")));
await browser.close();
console.log(results.join("\n"));
console.log(`\n${results.filter(result => result.startsWith("PASS")).length}/${results.length} passed`);
