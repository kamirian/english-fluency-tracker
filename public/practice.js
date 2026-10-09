// English Fluency Tracker · Practice Zone
// Copyright (c) 2026 Kiyan Amirian. All rights reserved.
(() => {
  const $p = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const now = () => new Date().toISOString();
  const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const makeId = () => globalThis.crypto?.randomUUID?.() || `practice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const modeLabels = { conversation: "Guided conversation", small_talk: "Small talk with a stranger", friend_chat: "Casual chat with a friend", roleplay: "Role-play", short_writing: "Short writing", grammar: "Grammar practice", collocation: "Collocation practice" };
  const modeHelp = {
    conversation: "Build a natural conversation through interesting follow-up questions.",
    small_talk: "Practice starting, continuing, and politely ending a brief conversation with a stranger in a safe public setting.",
    friend_chat: "Practice relaxed texting with natural abbreviations, short replies, and the right level of informality.",
    roleplay: "Practice handling a realistic situation while staying clear, natural, and responsive.",
    short_writing: "Produce a short piece of writing, then receive focused feedback.",
    grammar: "Use selected grammar naturally in context instead of completing isolated exercises.",
    collocation: "Turn saved collocations and phrasal verbs into language you can produce spontaneously."
  };
  const topicLabels = { surprise_me: "Surprise me", daily_life: "Daily life", work: "Work and professional life", culture: "Culture and relationships", books: "Books and stories", technology: "Technology", opinion: "Opinion and debate" };
  const scoreLabels = { overall: "Overall", naturalness: "Naturalness", grammar_accuracy: "Grammar", vocabulary_range: "Vocabulary", task_completion: "Task", target_usage: "Target use" };
  const targetTypeLabels = { collocation: "collocation", grammar: "grammar", phrasal_verb: "phrasal verb", vocabulary: "vocabulary" };
  const targetHelp = {
    smart: "Smart mix favors items that are due or difficult, then chooses expressions that naturally fit the conversation.",
    random: "Random mix creates variety and avoids targets from your most recent sessions when possible.",
    manual: "Select up to five targets yourself. The conversation will create natural chances to use them."
  };
  const fallbackOpeners = {
    conversation: "Tell me about a small decision you made recently. What influenced you, and would you make the same choice again?",
    small_talk: "You are waiting in line at a neighborhood coffee shop. I am another customer holding an unusual-looking pastry, and we have made brief eye contact. Start a friendly, low-pressure conversation with me. You can comment on the situation, ask one easy question, and leave naturally whenever you want.",
    friend_chat: "hey! ngl, today has been kind of chaotic. how's your day going?",
    roleplay: "Imagine I am a new coworker. Explain one unwritten rule that would help me fit in and avoid an awkward mistake.",
    short_writing: "Write 120–180 words about an opinion you have changed in the last few years and what changed your mind.",
    grammar: "Explain a recent situation that started in the past and is still affecting you now. Use the grammar targets you selected.",
    collocation: "Describe a current goal, problem, or decision while naturally using as many of your selected expressions as you can."
  };

  let apiReady = false;
  let busy = false;
  let activeSession = null;
  const learnerProfile = () => window.fluencyTracker?.getProfile?.() || {};

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      return copied;
    }
  }

  function appState() {
    const state = window.fluencyTracker?.getState?.();
    if (!state) return { entries: {}, library: [], practiceSessions: [] };
    state.practiceSessions = Array.isArray(state.practiceSessions) ? state.practiceSessions : [];
    return state;
  }

  function saveAppState() {
    window.fluencyTracker?.saveState?.();
  }

  function selectedTargets() {
    const state = appState();
    return [...document.querySelectorAll("#practiceTargets input:checked")].slice(0, 5).map(input => {
      const item = state.library.find(value => value.id === input.value);
      return item ? { id: item.id, type: item.type, front: item.front, back: item.back, example: item.example || "" } : null;
    }).filter(Boolean);
  }

  function targetRecord(item) {
    return item ? { id: item.id, type: item.type, front: item.front, back: item.back, example: item.example || "", tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [] } : null;
  }

  function availableTargets() {
    return appState().library.filter(item => item?.id && item.front && item.back && targetTypeLabels[item.type]);
  }

  function wordSet(value) {
    const ignored = new Set(["about", "after", "again", "also", "because", "before", "could", "from", "have", "into", "more", "some", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "very", "what", "when", "where", "which", "with", "would", "your"]);
    return new Set(String(value || "").toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.filter(word => !ignored.has(word)) || []);
  }

  function overlapCount(left, right) {
    let count = 0;
    for (const word of left) if (right.has(word)) count += 1;
    return count;
  }

  function practiceContext() {
    return [
      modeLabels[$p("#practiceMode").value],
      topicLabels[$p("#practiceTopic").value],
      $p("#practiceCustomTopic").value
    ].filter(Boolean).join(" ");
  }

  function recentTargetIds() {
    return new Set(appState().practiceSessions.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || ""))).slice(0, 4).flatMap(session => (session.targets || []).map(item => item.id)));
  }

  function targetPriority(item, contextWords = wordSet(practiceContext())) {
    const state = appState();
    const review = state.reviews?.[item.id];
    const due = !review?.dueAt || new Date(review.dueAt) <= new Date();
    const mistake = (item.tags || []).some(tag => /mistake/i.test(tag));
    const itemWords = wordSet([item.front, item.back, item.example, ...(item.tags || [])].join(" "));
    const topicFit = overlapCount(contextWords, itemWords);
    const mode = $p("#practiceMode").value;
    const modeFit = (mode === "grammar" && item.type === "grammar") || (mode === "collocation" && ["collocation", "phrasal_verb"].includes(item.type));
    return (due ? 55 : 0) + (review?.lastResult === "again" ? 40 : 0) + (mistake ? 22 : 0) + (!review ? 12 : 0) + Math.min(topicFit, 4) * 18 + (modeFit ? 24 : 0) - (recentTargetIds().has(item.id) ? 14 : 0);
  }

  function randomTargetMix(count) {
    const recent = recentTargetIds();
    const all = availableTargets();
    const fresh = all.filter(item => !recent.has(item.id));
    const pool = fresh.length >= count ? fresh : all;
    return pool.map(item => ({ item, sort: Math.random() })).sort((a, b) => a.sort - b.sort).slice(0, count).map(({ item }) => targetRecord(item));
  }

  function smartTargetMix(count, candidateLimit = count) {
    const contextWords = wordSet(practiceContext());
    const remaining = availableTargets().map(item => ({ item, words: wordSet([item.front, item.back, item.example, ...(item.tags || [])].join(" ")), score: targetPriority(item, contextWords) }));
    const chosen = [];
    const desiredCount = Math.min(count, remaining.length);
    while (chosen.length < desiredCount) {
      const chosenWords = new Set(chosen.flatMap(value => [...value.words]));
      const chosenTypes = new Set(chosen.map(value => value.item.type));
      remaining.sort((a, b) => {
        const adjusted = value => value.score + Math.min(overlapCount(value.words, chosenWords), 3) * 9 + (chosenTypes.has(value.item.type) ? 0 : 8);
        return adjusted(b) - adjusted(a) || String(b.item.updatedAt || b.item.createdAt || "").localeCompare(String(a.item.updatedAt || a.item.createdAt || ""));
      });
      chosen.push(remaining.shift());
    }
    return chosen.slice(0, candidateLimit).map(value => targetRecord(value.item));
  }

  function smartCandidates(limit = 20) {
    const contextWords = wordSet(practiceContext());
    return availableTargets().slice().sort((a, b) => targetPriority(b, contextWords) - targetPriority(a, contextWords)).slice(0, limit).map(targetRecord);
  }

  function applyTargetSelection(targets, message = "") {
    const ids = new Set(targets.map(item => item.id));
    document.querySelectorAll("#practiceTargets input").forEach(input => { input.checked = ids.has(input.value); });
    $p("#practiceTargetState").textContent = message || (targets.length ? `${targets.length} targets selected.` : "No targets available yet.");
  }

  function choosePracticeTargets() {
    const mode = $p("#practiceTargetMode").value;
    const count = Number($p("#practiceTargetCount").value) || 4;
    if (mode === "manual") {
      $p("#practiceTargetState").textContent = "Select the targets you want below.";
      return selectedTargets();
    }
    const targets = mode === "random" ? randomTargetMix(count) : smartTargetMix(count);
    const label = mode === "random" ? "Random mix ready. You can edit it." : "Smart mix ready. Live AI can refine it for the topic.";
    applyTargetSelection(targets, targets.length ? label : "Add learning items to create a mix.");
    return targets;
  }

  function syncTargetMode() {
    const mode = $p("#practiceTargetMode").value;
    $p("#practiceTargetHelp").textContent = targetHelp[mode];
    $p("#choosePracticeTargetsBtn").textContent = mode === "manual" ? "Clear target selection" : mode === "random" ? "Choose another random mix" : "Choose a smart mix";
    $p("#practiceTargetCount").disabled = mode === "manual";
    $p("#practiceTargetState").textContent = "";
  }

  function syncPracticeMode() {
    const mode = $p("#practiceMode").value;
    $p("#practiceModeHelp").textContent = modeHelp[mode] || modeHelp.conversation;
    const placeholders = {
      small_talk: "e.g. At a coffee shop, in a store, or while walking a dog",
      friend_chat: "e.g. Make weekend plans or react to a funny story"
    };
    $p("#practiceCustomTopic").placeholder = placeholders[mode] || "e.g. Convince a friend to try your favorite restaurant";
  }

  function renderTargets() {
    const state = appState();
    const dueRank = item => {
      const review = state.reviews?.[item.id];
      const due = !review?.dueAt || new Date(review.dueAt) <= new Date();
      const mistake = (item.tags || []).some(tag => /mistake/i.test(tag));
      return [due ? 0 : 1, review?.lastResult === "again" ? 0 : 1, mistake ? 0 : 1];
    };
    const items = state.library.filter(item => item.front && item.back).slice().sort((a, b) => {
      const left = dueRank(a);
      const right = dueRank(b);
      for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] - right[index];
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    });
    if (!items.length) {
      $p("#practiceTargets").innerHTML = '<div class="empty">Add a collocation, grammar point, phrasal verb, or vocabulary item to your library first—or practice without targets.</div>';
      return;
    }
    $p("#practiceTargets").innerHTML = items.slice(0, 60).map(item => `<label class="practice-target"><input type="checkbox" value="${escapeHtml(item.id)}" /><span><strong>${escapeHtml(item.front)}</strong><small>${escapeHtml(targetTypeLabels[item.type] || String(item.type).replace("_", " "))} · ${escapeHtml(item.back)}</small></span></label>`).join("");
  }

  function renderHistory() {
    const records = appState().practiceSessions.slice().sort((a, b) => String(b.finishedAt || b.startedAt).localeCompare(String(a.finishedAt || a.startedAt))).slice(0, 6);
    $p("#practiceSessionCount").textContent = `${appState().practiceSessions.length} session${appState().practiceSessions.length === 1 ? "" : "s"}`;
    $p("#practiceHistory").innerHTML = records.length ? `<h3>Recent practice</h3>${records.map(record => `<article class="practice-history-item"><strong>${escapeHtml(modeLabels[record.mode] || record.mode)}${record.review?.scores?.overall != null ? ` · ${Math.round(record.review.scores.overall)}/100` : ""}</strong><small>${new Date(record.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${record.messages.filter(message => message.role === "user").length} replies · ${record.status === "complete" ? "reviewed" : "in progress"}</small></article>`).join("")}` : "";
  }

  function renderChat() {
    if (!activeSession?.messages?.length) {
      $p("#practiceChat").innerHTML = '<div class="empty">Choose a mode and targets, then start. No AI connected? Start practice copies a ready-made prompt for any AI chat.</div>';
      return;
    }
    $p("#practiceChat").innerHTML = activeSession.messages.map(message => `<div class="practice-message ${escapeHtml(message.role)}">${escapeHtml(message.content)}${message.correction ? `<div class="feedback-card" style="margin-top:9px"><strong>Coach note</strong><span>${escapeHtml(message.correction.better || "")}</span><small>${escapeHtml(message.correction.reason || "")}</small></div>` : ""}</div>`).join("");
    $p("#practiceChat").scrollTop = $p("#practiceChat").scrollHeight;
    const userTurns = activeSession.messages.filter(message => message.role === "user").length;
    const complete = activeSession.status === "complete";
    const external = activeSession.status === "external";
    $p("#sendPracticeBtn").disabled = busy || complete || external || !apiReady || userTurns >= activeSession.maxTurns;
    $p("#finishPracticeBtn").disabled = busy || complete || external || !apiReady || userTurns === 0;
    $p("#practiceCost").textContent = tokenText(activeSession.usage);
  }

  function renderReview() {
    const review = activeSession?.review;
    if (!review) {
      $p("#practiceReview").innerHTML = "";
      return;
    }
    const scores = Object.entries(scoreLabels).map(([key, label]) => `<div class="score-card"><span>${label}</span><strong>${Math.round(Number(review.scores?.[key]) || 0)}</strong></div>`).join("");
    const strengths = (review.strengths || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");
    const corrections = (review.priority_corrections || []).map(item => `<div class="feedback-card"><strong>${escapeHtml(item.original || "Correction")}</strong><span>${escapeHtml(item.corrected || "")}</span><small>${escapeHtml(item.explanation || "")}</small></div>`).join("");
    const spellings = (review.spelling_mistakes || []).map(item => `<div class="feedback-card spelling-feedback"><strong>Spelling · ${escapeHtml(item.original || "")}</strong><span>${escapeHtml(item.correct || "")}</span><small>${escapeHtml(item.meaning || item.evidence || "Added to Spelling & Dictation.")}</small></div>`).join("");
    const targetResults = (review.target_results || []).map(item => `<div class="feedback-card"><strong>${escapeHtml(item.target || "Target")} · ${escapeHtml(String(item.status || "").replaceAll("_", " "))}</strong><span>${escapeHtml(item.evidence || item.feedback || "")}</span>${item.evidence && item.feedback ? `<small>${escapeHtml(item.feedback)}</small>` : ""}</div>`).join("");
    const proposalItems = review.proposed_items || [];
    const proposals = proposalItems.map((item, index) => `<article class="proposal"><span class="type-tag ${escapeHtml(item.type)}">${escapeHtml(String(item.type || "item").replace("_", " "))}</span><strong>${escapeHtml(item.front || "")}</strong><p>${escapeHtml(item.back || "")}</p>${item.example ? `<small>Example: ${escapeHtml(item.example)}</small>` : ""}${item.reason ? `<small>Why save it: ${escapeHtml(item.reason)}</small>` : ""}<button class="icon-btn" type="button" data-practice-proposal="${index}" style="margin-top:9px" ${item.added ? "disabled" : ""}>${item.added ? item.addedBy === "automatic" ? "Added automatically ✓" : "Added to library ✓" : "Add to learning library"}</button></article>`).join("");
    const pendingCount = proposalItems.filter(item => !item.added).length;
    const learnableAction = !proposalItems.length ? "" : pendingCount
      ? `<button class="btn" id="addAllPracticeItemsBtn" type="button">Add ${pendingCount === proposalItems.length ? "all suggestions" : `${pendingCount} remaining suggestion${pendingCount === 1 ? "" : "s"}`}</button>`
      : `<div class="practice-added-banner" role="status" aria-live="polite"><b>✓</b><span>${escapeHtml(review.library_notice || `${proposalItems.length} suggestion${proposalItems.length === 1 ? "" : "s"} added to your Learning Library.`)}</span></div>`;
    $p("#practiceReview").innerHTML = `<h3>Practice review</h3><div class="score-grid">${scores}</div><div class="feedback-card"><strong>Summary</strong><span>${escapeHtml(review.summary || "")}</span>${strengths ? `<ul>${strengths}</ul>` : ""}</div>${corrections}${spellings}${targetResults}${proposals ? `<h3>Suggested learnables</h3>${proposals}${learnableAction}` : ""}${review.next_focus ? `<div class="feedback-card"><strong>Next focus</strong><span>${escapeHtml(review.next_focus)}</span></div>` : ""}`;
  }

  function updateSession(record) {
    const state = appState();
    const index = state.practiceSessions.findIndex(item => item.id === record.id);
    if (index >= 0) state.practiceSessions[index] = record;
    else state.practiceSessions.push(record);
    saveAppState();
    renderHistory();
  }

  // Costs depend on each provider's pricing, so the tracker reports tokens, not dollars.
  function tokenText(usage = {}) {
    const input = Number(usage?.input_tokens || 0);
    const output = Number(usage?.output_tokens || 0);
    return input || output ? `Tokens used: ${input.toLocaleString("en-US")} in · ${output.toLocaleString("en-US")} out` : "Tokens used: 0";
  }

  function accountUsage(usage = {}) {
    if (!activeSession) return;
    activeSession.usage = activeSession.usage || { input_tokens: 0, output_tokens: 0 };
    activeSession.usage.input_tokens += Number(usage.input_tokens || 0);
    activeSession.usage.output_tokens += Number(usage.output_tokens || 0);
  }

  async function apiRequest(action) {
    if (!window.FluencyAI?.available()) throw new Error("No AI is connected.");
    const payload = await window.FluencyAI.run(`practice_${action}`, { session: activeSession });
    accountUsage(payload.usage);
    return payload.result;
  }

  function setBusy(value, label = "") {
    busy = value;
    $p("#practiceSaveState").textContent = label;
    renderChat();
    $p("#startPracticeBtn").disabled = value;
  }

  function manualOpening(session) {
    const custom = session.customTopic.trim();
    const topic = custom || topicLabels[session.topic] || "a useful everyday topic";
    return `${fallbackOpeners[session.mode] || fallbackOpeners.conversation}\n\nTopic: ${topic}${session.targets.length ? `\nTry to use: ${session.targets.map(item => item.front).join(", ")}` : ""}`;
  }

  function buildSession() {
    const targetMode = $p("#practiceTargetMode").value;
    const targetCount = Number($p("#practiceTargetCount").value) || 4;
    const targets = targetMode === "manual" ? selectedTargets() : choosePracticeTargets();
    return {
      id: makeId(), date: localDate(), mode: $p("#practiceMode").value, topic: $p("#practiceTopic").value,
      customTopic: $p("#practiceCustomTopic").value.trim(), feedback: $p("#practiceFeedback").value,
      maxTurns: Number($p("#practiceTurns").value) || 10, targetMode, targetCount, targets,
      targetCandidates: targetMode === "smart" ? smartCandidates(20) : [], messages: [], status: "active",
      usage: { input_tokens: 0, output_tokens: 0 }, startedAt: now(), updatedAt: now(), review: null
    };
  }

  // Copy-and-paste practice: the conversation happens in the learner's own AI chat,
  // which returns one JSON result that is applied here.
  async function startExternalPractice() {
    if (busy) return;
    const builder = window.FluencyPrompts?.manualPracticePrompt;
    if (!builder) {
      $p("#practiceSaveState").textContent = "The prompt builder is still loading. Try again in a moment.";
      return;
    }
    const session = buildSession();
    delete session.targetCandidates;
    session.status = "external";
    session.messages.push({ role: "system", content: "This session runs in your own AI chat. Paste the practice prompt into ChatGPT, Claude, Gemini, or another assistant and have the conversation there. When it gives you the final JSON, paste it below and choose Apply review.", createdAt: now() });
    activeSession = session;
    updateSession(activeSession);
    const promptText = builder({ ...session, learner: learnerProfile() });
    const copied = await copyText(promptText);
    $p("#practicePromptOutput").hidden = copied;
    $p("#practicePromptOutput").value = copied ? "" : promptText;
    $p("#practiceSaveState").textContent = copied ? "Practice prompt copied. Paste it into your AI chat to begin." : "Your browser blocked copying. Select the prompt below and copy it manually.";
    renderChat();
    renderReview();
  }

  async function startPractice() {
    if (!apiReady) return startExternalPractice();
    const session = buildSession();
    activeSession = session;
    setBusy(true, "Starting your practice…");
    try {
      const result = await apiRequest("start");
      if (activeSession !== session) return;
      if (activeSession.targetMode === "smart" && Array.isArray(result.selected_target_ids)) {
        const selectedIds = new Set(result.selected_target_ids.slice(0, activeSession.targetCount));
        const refined = activeSession.targetCandidates.filter(item => selectedIds.has(item.id)).slice(0, activeSession.targetCount);
        if (refined.length) {
          activeSession.targets = refined;
          applyTargetSelection(refined, `AI chose ${refined.length} targets that fit this conversation.`);
        }
      }
      activeSession.messages.push({ role: "assistant", content: result.reply || manualOpening(activeSession), createdAt: now() });
      $p("#practiceSaveState").textContent = "Live practice started.";
    } catch (error) {
      if (activeSession !== session) return;
      activeSession.messages.push({ role: "system", content: `${error.message} Try Start practice again, or use Copy practice prompt to practice in any AI chat.`, createdAt: now() });
      $p("#practiceSaveState").textContent = "The AI did not answer.";
    } finally {
      if (activeSession !== session) return setBusy(false, "");
      delete activeSession.targetCandidates;
      activeSession.updatedAt = now();
      updateSession(activeSession);
      setBusy(false, $p("#practiceSaveState").textContent);
      renderChat();
      renderReview();
      $p("#practiceInput").focus();
    }
  }

  async function sendPractice() {
    const content = $p("#practiceInput").value.trim();
    if (!activeSession || !content || busy || activeSession.status === "complete") return;
    activeSession.messages.push({ role: "user", content, createdAt: now() });
    $p("#practiceInput").value = "";
    activeSession.updatedAt = now();
    updateSession(activeSession);
    renderChat();
    const userTurns = activeSession.messages.filter(message => message.role === "user").length;
    const session = activeSession;
    setBusy(true, "Thinking about your reply…");
    try {
      const result = await apiRequest("reply");
      if (activeSession !== session) return;
      const correction = result.brief_correction && result.brief_correction.better ? result.brief_correction : null;
      activeSession.messages.push({ role: "assistant", content: result.reply || "Tell me a little more.", correction, createdAt: now() });
      if (result.should_end || userTurns >= activeSession.maxTurns) $p("#practiceSaveState").textContent = "You have reached the end. Finish and score when ready.";
      else $p("#practiceSaveState").textContent = "Reply saved.";
    } catch (error) {
      if (activeSession !== session) return;
      activeSession.messages.push({ role: "system", content: `${error.message} Your reply is saved. Try sending again, or use Copy this session for review with any AI chat.`, createdAt: now() });
      $p("#practiceSaveState").textContent = "The AI did not answer. Your reply is saved.";
    } finally {
      if (activeSession !== session) return setBusy(false, "");
      activeSession.updatedAt = now();
      updateSession(activeSession);
      setBusy(false, $p("#practiceSaveState").textContent);
      renderChat();
    }
  }

  function recordProgress(session) {
    if (session.progressRecordedAt) return;
    const state = appState();
    const activity = session.mode === "short_writing" ? "writing" : session.mode === "grammar" ? "grammar" : session.mode === "collocation" ? "chunks" : "chat";
    const minutes = Math.max(5, Math.min(60, Math.round((new Date(session.finishedAt) - new Date(session.startedAt)) / 60000) || 5));
    const entry = state.entries[session.date] || { status: "practiced", activities: {}, phrases: [], question: "", correction: "", notes: "", updatedAt: now() };
    entry.status = entry.status === "rest" ? "light" : (entry.status || "practiced");
    entry.activities = entry.activities || {};
    entry.activities[activity] = (Number(entry.activities[activity]) || 0) + minutes;
    entry.notes = [entry.notes, `Practice Zone text chat: ${modeLabels[session.mode]}${session.review?.scores?.overall != null ? ` (${Math.round(session.review.scores.overall)}/100)` : ""}.`].filter(Boolean).join(" ");
    entry.updatedAt = now();
    state.entries[session.date] = entry;
    session.progressRecordedAt = now();
  }

  async function finishPractice() {
    if (!activeSession || busy || activeSession.status === "complete") return;
    const session = activeSession;
    setBusy(true, "Preparing your review and scores…");
    try {
      const result = await apiRequest("evaluate");
      if (activeSession !== session) return setBusy(false, "");
      applyReviewPayload({ practice_review_version: 1, session_id: activeSession.id, ...result });
      $p("#practiceSaveState").textContent = "Review applied. Reusable mistakes were added to your smart review queue.";
    } catch (error) {
      if (activeSession !== session) return setBusy(false, "");
      $p("#practiceSaveState").textContent = `${error.message} You can also use Copy this session for review with any AI chat.`;
      setBusy(false, $p("#practiceSaveState").textContent);
      renderChat();
      document.querySelector("#practiceFallbackTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function parseJson(raw) {
    const cleaned = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("I could not find a valid JSON review package.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function normalizeReview(payload) {
    const scores = payload.scores || {};
    const rawScores = [scores.naturalness, scores.grammar_accuracy, scores.vocabulary_range, scores.task_completion, scores.target_usage, scores.overall].map(value => Number(value) || 0);
    const tenPointScale = rawScores.some(Boolean) && rawScores.every(value => value <= 10);
    const clamp = value => Math.max(0, Math.min(100, (Number(value) || 0) * (tenPointScale ? 10 : 1)));
    return {
      scores: { naturalness: clamp(scores.naturalness), grammar_accuracy: clamp(scores.grammar_accuracy), vocabulary_range: clamp(scores.vocabulary_range), task_completion: clamp(scores.task_completion), target_usage: clamp(scores.target_usage), overall: clamp(scores.overall) },
      summary: String(payload.summary || "").trim(), strengths: Array.isArray(payload.strengths) ? payload.strengths.slice(0, 4) : [],
      priority_corrections: Array.isArray(payload.priority_corrections) ? payload.priority_corrections.slice(0, 6) : [],
      spelling_mistakes: Array.isArray(payload.spelling_mistakes) ? payload.spelling_mistakes.slice(0, 8) : [],
      target_results: Array.isArray(payload.target_results) ? payload.target_results.slice(0, 8) : [],
      proposed_items: Array.isArray(payload.proposed_items) ? payload.proposed_items.slice(0, 5).map(item => ({ ...item, added: false, addedBy: "" })) : [],
      next_focus: String(payload.next_focus || "").trim(), reviewedAt: now()
    };
  }

  function applyReviewPayload(payload) {
    if (payload.practice_review_version !== 1 || !payload.session_id) throw new Error("This is not a compatible Practice Zone review package.");
    const state = appState();
    const session = state.practiceSessions.find(item => item.id === payload.session_id) || activeSession;
    if (!session || session.id !== payload.session_id) throw new Error("The matching Practice Zone session was not found in this browser.");
    if (Array.isArray(payload.transcript) && !session.messages.some(message => message.role === "user")) {
      const roles = { coach: "assistant", assistant: "assistant", ai: "assistant", learner: "user", user: "user", me: "user" };
      const imported = payload.transcript
        .map(item => ({ role: roles[String(item?.role || "").toLowerCase()], content: String(item?.content || "").trim().slice(0, 5000), createdAt: now() }))
        .filter(message => message.role && message.content)
        .slice(0, 60);
      if (imported.length) session.messages = imported;
    }
    session.review = normalizeReview(payload);
    session.status = "complete";
    session.finishedAt = session.finishedAt || now();
    session.updatedAt = now();
    activeSession = session;
    if (!session.learningScheduleAppliedAt) {
      for (const result of session.review.target_results || []) {
        const target = state.library.find(item => item.id === result.target_id) || state.library.find(item => item.front.toLowerCase() === String(result.target || "").trim().toLowerCase());
        if (!target) continue;
        if (result.status === "used_naturally") window.fluencyTracker?.recordLearningOutcome?.(target.id, "right", "Practice Zone target");
        else if (result.status === "needs_correction") window.fluencyTracker?.recordLearningOutcome?.(target.id, "again", "Practice Zone target mistake");
      }
      session.learningScheduleAppliedAt = now();
    }
    if (!session.autoLearnablesAppliedAt) {
      const validTypes = new Set(["grammar", "collocation", "phrasal_verb", "vocabulary"]);
      let addedCount = 0;
      let existingCount = 0;
      for (const item of session.review.proposed_items || []) {
        if (!item || !validTypes.has(item.type) || !String(item.front || "").trim() || !String(item.back || "").trim()) continue;
        const added = window.fluencyTracker?.addLibraryItem?.({
          type: item.type, front: String(item.front).trim(), back: String(item.back).trim(), example: String(item.example || "").trim(),
          source: `Practice Zone · ${session.date}`, tags: ["practice-mistake", "AI-created"], review: null
        });
        item.added = true;
        item.addedBy = "automatic";
        added ? addedCount++ : existingCount++;
      }
      const total = addedCount + existingCount;
      if (total) {
        session.review.library_notice = addedCount
          ? `${addedCount} new suggestion${addedCount === 1 ? " was" : "s were"} added automatically to your Learning Library${existingCount ? `; ${existingCount} already existed` : ""}.`
          : "All suggestions were already in your Learning Library.";
        window.fluencyTracker?.notify?.(session.review.library_notice);
      }
      session.autoLearnablesAppliedAt = now();
    }
    if (!session.spellingMistakesAppliedAt) {
      for (const mistake of session.review.spelling_mistakes || []) {
        window.fluencyTracker?.addSpellingMistake?.({
          original: String(mistake.original || "").trim(),
          correct: String(mistake.correct || "").trim(),
          meaning: String(mistake.meaning || "").trim(),
          example: String(mistake.example || mistake.evidence || "").trim(),
          evidence: String(mistake.evidence || "").trim(),
          source: `Practice Zone · ${session.date}`
        });
      }
      session.spellingMistakesAppliedAt = now();
    }
    recordProgress(session);
    updateSession(session);
    setBusy(false, "Review applied.");
    renderChat();
    renderReview();
  }

  function applyPastedReview() {
    try {
      applyReviewPayload(parseJson($p("#practiceReviewPackage").value));
      $p("#practiceReviewPackage").value = "";
      $p("#practiceSaveState").textContent = "Manual review imported. Reusable mistakes were added to your smart review queue.";
    } catch (error) {
      $p("#practiceSaveState").textContent = error.message || "The review could not be applied.";
    }
  }

  function manualReviewPrompt() {
    if (!activeSession) throw new Error("Start a Practice Zone session first.");
    const profile = learnerProfile();
    const variety = profile.variety || "American English";
    const learnerText = window.FluencyPrompts?.learnerSummary ? window.FluencyPrompts.learnerSummary(profile) : "";
    return `Please review this Practice Zone session for an English learner who wants natural, educated ${variety}. ${learnerText}\n\nAssess naturalness, grammar accuracy, vocabulary range, task completion, and use of the chosen learning targets. Be encouraging but precise. Use integer scores from 0 to 100, not a 1–10 scale. Judge specifically for natural contemporary ${variety}. Do not reward forced or merely understandable target use, and preserve the learner's intended meaning in corrections. Do not create a learning item only because a target was not used. Put genuine spelling errors in spelling_mistakes separately. Turn only genuinely reusable mistakes into proposed learning items, with at most five.\n\nReturn ONLY valid JSON with this exact shape—no Markdown or commentary outside the JSON:\n{\n  "practice_review_version": 1,\n  "session_id": "${activeSession.id}",\n  "scores": { "naturalness": 0, "grammar_accuracy": 0, "vocabulary_range": 0, "task_completion": 0, "target_usage": 0, "overall": 0 },\n  "summary": "brief overall feedback",\n  "strengths": ["specific strength"],\n  "priority_corrections": [{ "original": "learner wording", "corrected": "natural correction", "explanation": "brief reason" }],\n  "spelling_mistakes": [{ "original": "misspelling", "correct": "correct spelling", "meaning": "short meaning", "example": "natural sentence", "evidence": "learner sentence" }],\n  "target_results": [{ "target_id": "library item id or empty", "target": "target expression", "status": "used_naturally|needs_correction|not_used", "evidence": "learner wording or empty", "feedback": "brief feedback" }],\n  "proposed_items": [{ "type": "grammar|collocation|phrasal_verb|vocabulary", "front": "reusable point", "back": "meaning or rule", "example": "natural example", "reason": "why this is useful" }],\n  "next_focus": "one practical next step"\n}\n\nSession package:\n${JSON.stringify({ mode: modeLabels[activeSession.mode], topic: activeSession.customTopic || topicLabels[activeSession.topic], feedback_timing: activeSession.feedback, targets: activeSession.targets, transcript: activeSession.messages.map(({ role, content }) => ({ role, content })) }, null, 2)}`;
  }

  async function copyManualPrompt() {
    try {
      if (!await copyText(manualReviewPrompt())) throw new Error("Your browser blocked copying.");
      $p("#practiceSaveState").textContent = "Session copied. Paste it into your AI chat, then paste the JSON reply below.";
    } catch (error) {
      $p("#practiceSaveState").textContent = error.message || "Your browser blocked copying.";
    }
  }

  function addProposal(index, options = {}) {
    const item = activeSession?.review?.proposed_items?.[index];
    if (!item || item.added) return false;
    const valid = ["grammar", "collocation", "phrasal_verb", "vocabulary"].includes(item.type);
    if (!valid || !String(item.front || "").trim() || !String(item.back || "").trim()) return false;
    const added = window.fluencyTracker?.addLibraryItem?.({
      type: item.type, front: String(item.front).trim(), back: String(item.back).trim(), example: String(item.example || "").trim(),
      source: `Practice Zone · ${activeSession.date}`, tags: ["practice-mistake", "AI-created"], review: null
    });
    item.added = true;
    item.addedBy = "manual";
    activeSession.updatedAt = now();
    if (!options.defer) {
      activeSession.review.library_notice = added ? "Suggestion added to your Learning Library." : "That suggestion was already in your Learning Library.";
      updateSession(activeSession);
      renderTargets();
      renderReview();
      $p("#practiceSaveState").textContent = activeSession.review.library_notice;
      window.fluencyTracker?.notify?.(activeSession.review.library_notice);
    }
    return Boolean(added);
  }

  function resetPractice() {
    activeSession = null;
    $p("#practiceInput").value = "";
    $p("#practiceReviewPackage").value = "";
    $p("#practiceSaveState").textContent = "Ready for a new session.";
    $p("#practiceCost").textContent = "Tokens used: 0";
    $p("#practicePromptOutput").hidden = true;
    renderChat();
    renderReview();
  }

  function checkApi(detail = {}) {
    apiReady = Boolean(window.FluencyAI?.available());
    const label = window.FluencyAI?.describe?.() || "";
    $p("#practiceApiLight").classList.toggle("ready", apiReady);
    $p("#practiceApiStatus").textContent = apiReady
      ? `Live practice with ${label}`
      : detail.signedIn ? "Copy-and-paste mode · connect an AI in Settings to chat here" : "Copy-and-paste mode · sign in and connect an AI in Settings to chat here";
    $p("#startPracticeBtn").textContent = apiReady ? "Start practice" : "Copy practice prompt";
    renderChat();
  }
  $p("#practiceMode").addEventListener("change", () => {
    syncPracticeMode();
    if ($p("#practiceTargetMode").value !== "manual") choosePracticeTargets();
  });
  $p("#practiceTargetMode").addEventListener("change", syncTargetMode);
  $p("#choosePracticeTargetsBtn").addEventListener("click", () => {
    if ($p("#practiceTargetMode").value === "manual") applyTargetSelection([], "Selection cleared. Choose your targets below.");
    else choosePracticeTargets();
  });
  $p("#practiceTargets").addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const checked = [...document.querySelectorAll("#practiceTargets input:checked")];
    if (checked.length > 5) {
      event.target.checked = false;
      $p("#practiceSaveState").textContent = "Choose no more than five learning targets.";
    }
  });
  $p("#startPracticeBtn").addEventListener("click", startPractice);
  $p("#resetPracticeBtn").addEventListener("click", resetPractice);
  $p("#sendPracticeBtn").addEventListener("click", sendPractice);
  $p("#practiceInput").addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendPractice();
  });
  $p("#finishPracticeBtn").addEventListener("click", finishPractice);
  $p("#copyPracticeBtn").addEventListener("click", copyManualPrompt);
  $p("#copyPracticePromptBtn").addEventListener("click", startExternalPractice);
  $p("#applyPracticeReviewBtn").addEventListener("click", applyPastedReview);
  $p("#practiceReview").addEventListener("click", event => {
    const proposal = event.target.closest("[data-practice-proposal]");
    if (proposal) return addProposal(Number(proposal.dataset.practiceProposal));
    if (event.target.closest("#addAllPracticeItemsBtn")) {
      let addedCount = 0;
      let existingCount = 0;
      (activeSession?.review?.proposed_items || []).forEach((item, index) => {
        if (item.added) return;
        addProposal(index, { defer: true }) ? addedCount++ : existingCount++;
      });
      const total = addedCount + existingCount;
      const message = addedCount
        ? `${addedCount} suggestion${addedCount === 1 ? "" : "s"} added to your Learning Library${existingCount ? `; ${existingCount} already existed` : ""}.`
        : total ? "All of those suggestions were already in your Learning Library." : "All suggestions are already in your Learning Library.";
      activeSession.review.library_notice = message;
      activeSession.updatedAt = now();
      updateSession(activeSession);
      renderTargets();
      renderReview();
      $p("#practiceSaveState").textContent = message;
      window.fluencyTracker?.notify?.(message);
    }
  });

  renderTargets();
  syncPracticeMode();
  syncTargetMode();
  renderHistory();
  checkApi();
  window.addEventListener("fluency-ai-changed", event => checkApi(event.detail || {}));
  // A session belongs to the account that started it; switching accounts closes it.
  let practiceAccountId = window.fluencyTracker?.getAccount?.().user?.id || "";
  window.addEventListener("fluency-account-changed", event => {
    const nextId = event.detail?.user?.id || "";
    if (nextId === practiceAccountId) return;
    practiceAccountId = nextId;
    if (activeSession) resetPractice();
    renderTargets();
    renderHistory();
  });
  window.addEventListener("fluency-state-updated", () => {
    renderTargets();
    renderHistory();
  });
})();
