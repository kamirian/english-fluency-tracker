(() => {
      // English Fluency Tracker · © 2026 Kiyan Amirian. All rights reserved.
      const DEVICE_STORAGE_KEY = "english-fluency-tracker-v1";
      const DEVICE_DRAFTS_KEY = "english-fluency-daily-drafts-v1";
      const ACTIVE_ACCOUNT_KEY = "english-fluency-active-account";
      const ENGLISH_VARIETIES = ["American English", "British English", "Canadian English", "Australian English", "International English"];
      // Signed-in progress is cached under a per-account key, so two people who share a
      // browser never see or merge each other's data.
      const storageKeysFor = userId => userId
        ? { state: `${DEVICE_STORAGE_KEY}:account:${userId}`, drafts: `${DEVICE_DRAFTS_KEY}:account:${userId}` }
        : { state: DEVICE_STORAGE_KEY, drafts: DEVICE_DRAFTS_KEY };
      const readStorage = key => { try { return localStorage.getItem(key); } catch { return null; } };
      const rememberedAccountId = readStorage(ACTIVE_ACCOUNT_KEY) || "";
      let STORAGE_KEY = storageKeysFor(rememberedAccountId).state;
      let DAILY_DRAFTS_KEY = storageKeysFor(rememberedAccountId).drafts;
      const activities = [
        { id: "listening", name: "Podcast / listening", short: "Podcast", hint: "Listen once for meaning, then replay with the transcript. Save 1–2 chunks.", suggested: 15 },
        { id: "shadowing", name: "Shadowing", short: "Shadowing", hint: "Repeat a 20–30 second clip, matching rhythm, stress, and reductions.", suggested: 5 },
        { id: "speaking", name: "Speaking / friend", short: "Speaking", hint: "Talk or send a voice note. Use at least one new chunk without reading.", suggested: 10 },
        { id: "chat", name: "Interactive chat", short: "Chat", hint: "Practice through a typed back-and-forth conversation or role-play.", suggested: 10 },
        { id: "reading", name: "Reading", short: "Reading", hint: "Read 5–10 pages, save one phrase, then retell the main event aloud.", suggested: 10 },
        { id: "grammar", name: "Grammar audit", short: "Grammar", hint: "Diagnose one weak point, review only that unit, and make three examples.", suggested: 15 },
        { id: "chunks", name: "Collocations / phrasal verbs", short: "Chunks", hint: "Study one short section. Choose up to three useful chunks and use them.", suggested: 15 },
        { id: "writing", name: "Writing and rewriting", short: "Writing", hint: "Write a short draft, review the key corrections, and rewrite it without copying.", suggested: 20 },
        { id: "review", name: "Flashcards / review", short: "Review", hint: "Recall, apply, and produce language from your smart review queue.", suggested: 10 }
      ];
      const activityColors = {
        listening: "#38bdf8",
        shadowing: "#a78bfa",
        speaking: "#fb7185",
        chat: "#c084fc",
        reading: "#4ade80",
        grammar: "#fbbf24",
        chunks: "#2dd4bf",
        writing: "#f472b6",
        review: "#f97316"
      };
      const libraryTypeColors = { collocation: "#2dd4bf", phrasal_verb: "#a78bfa", grammar: "#7dd3fc", vocabulary: "#fbbf24" };
      const libraryTypePlurals = { collocation: "Collocations", phrasal_verb: "Phrasal verbs", grammar: "Grammar points", vocabulary: "Vocabulary items" };
      const writingTypeLabels = { casual_message: "Casual message", email: "Email", journal: "Journal", summary: "Summary", opinion: "Opinion", professional: "Professional writing" };
      const sessionTypeLabels = { listening: "Listening", reading: "Reading", shadowing: "Shadowing", speaking: "Speaking" };
      const sessionFieldConfig = {
        listening: { source: "Podcast or video title", detail: "Episode or timestamps", quantity: "Useful phrases found", evidence: "Your listening summary", evidencePlaceholder: "Summarize the main idea and two details you understood." },
        reading: { source: "Book or article", detail: "Pages or chapter", quantity: "Pages read", evidence: "Your reading summary", evidencePlaceholder: "Summarize what happened or explain the author’s main point." },
        shadowing: { source: "Audio or video title", detail: "Exact clip timestamps", quantity: "Repetitions", evidence: "Sentence practiced and difficulty", evidencePlaceholder: "Paste the sentence and note the sounds, rhythm, or reductions that felt difficult." },
        speaking: { source: "Partner or conversation setting", detail: "Topic", quantity: "New expressions used", evidence: "What you tried to say and how it went", evidencePlaceholder: "Describe the conversation, what you expressed well, and where you became stuck." }
      };
      const weeklyPriorities = [
        { day: 1, name: "Listening + shadowing", detail: "Use a conversational podcast, shadow 20–30 seconds, then write a 100-word summary.", activities: { listening: 15, shadowing: 5, writing: 15 } },
        { day: 2, name: "Collocations + writing", detail: "Study up to three chunks and use at least two in a 120–150 word personal paragraph.", activities: { chunks: 15, writing: 20 } },
        { day: 3, name: "Speaking + podcast", detail: "Talk with a friend or send a voice note, then save two natural expressions you heard or used.", activities: { listening: 10, speaking: 20 } },
        { day: 4, name: "Reading + phrasal verbs", detail: "Read 10–15 pages, choose useful phrasing, and retell the main idea aloud.", activities: { reading: 20, chunks: 15, speaking: 5 } },
        { day: 5, name: "Grammar + rewrite", detail: "Audit one grammar weakness and rewrite an earlier draft using the correction naturally.", activities: { grammar: 15, writing: 20 } },
        { day: 6, name: "Long writing + conversation", detail: "Write 250–400 words and discuss the same topic with a friend.", activities: { writing: 30, speaking: 20 } },
        { day: 0, name: "Review or catch-up", detail: "Review flashcards, revisit mistakes, and catch up lightly—or take a genuine rest day.", activities: { review: 10 } }
      ];

      const $ = (selector) => document.querySelector(selector);
      const $$ = (selector) => [...document.querySelectorAll(selector)];
      const localDate = (date = new Date()) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };
      const parseDate = (value) => new Date(`${value}T12:00:00`);
      const formatDate = (value, options = { month: "short", day: "numeric" }) => parseDate(value).toLocaleDateString("en-US", options);
      const emptyState = () => ({ entries: {}, library: [], libraryArchive: [], reviews: {}, writings: {}, sessions: [], practiceSessions: [], spellingItems: [], spellingProgress: {}, profile: {} });
      const recordTimestamp = value => {
        if (!value || typeof value !== "object") return 0;
        const candidates = [value.updatedAt, value.deletedAt, value.restoredAt, value.reviewedAt, value.lastReviewedAt, value.lastProductionAt, value.finishedAt, value.last, value.startedAt, value.createdAt, value.dueAt];
        return Math.max(0, ...candidates.map(candidate => new Date(candidate || 0).getTime() || 0));
      };
      const chooseNewest = (left, right) => {
        if (!left) return right;
        if (!right) return left;
        return recordTimestamp(right) >= recordTimestamp(left) ? right : left;
      };
      function mergeRecordMaps(localMap, cloudMap) {
        const result = { ...(cloudMap || {}) };
        for (const [key, value] of Object.entries(localMap || {})) result[key] = chooseNewest(result[key], value);
        return result;
      }
      function mergeRecordLists(localList, cloudList) {
        const records = new Map();
        for (const item of [...(cloudList || []), ...(localList || [])]) {
          if (!item || !item.id) continue;
          records.set(item.id, chooseNewest(records.get(item.id), item));
        }
        return [...records.values()];
      }
      function normalizeStateShape(value) {
        const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : emptyState();
        parsed.entries = parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
        parsed.library = Array.isArray(parsed.library) ? parsed.library : [];
        parsed.libraryArchive = Array.isArray(parsed.libraryArchive) ? parsed.libraryArchive : [];
        parsed.reviews = parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : {};
        parsed.writings = parsed.writings && typeof parsed.writings === "object" ? parsed.writings : {};
        parsed.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
        parsed.practiceSessions = Array.isArray(parsed.practiceSessions) ? parsed.practiceSessions : [];
        parsed.spellingItems = Array.isArray(parsed.spellingItems) ? parsed.spellingItems : [];
        parsed.spellingProgress = parsed.spellingProgress && typeof parsed.spellingProgress === "object" ? parsed.spellingProgress : {};
        parsed.profile = parsed.profile && typeof parsed.profile === "object" && !Array.isArray(parsed.profile) ? parsed.profile : {};
        return parsed;
      }
      function mergeTrackerStates(localState, cloudState) {
        const local = normalizeStateShape(structuredClone(localState || emptyState()));
        const cloud = normalizeStateShape(structuredClone(cloudState || emptyState()));
        const libraryArchive = mergeRecordLists(local.libraryArchive, cloud.libraryArchive);
        const library = mergeRecordLists(local.library, cloud.library).filter(item => {
          const archive = libraryArchive.find(record => record.id === item.id);
          return !archive || archive.status !== "trashed" || recordTimestamp(item) > recordTimestamp(archive);
        });
        return {
          ...cloud,
          ...local,
          entries: mergeRecordMaps(local.entries, cloud.entries),
          library,
          libraryArchive,
          reviews: mergeRecordMaps(local.reviews, cloud.reviews),
          writings: mergeRecordMaps(local.writings, cloud.writings),
          sessions: mergeRecordLists(local.sessions, cloud.sessions),
          practiceSessions: mergeRecordLists(local.practiceSessions, cloud.practiceSessions),
          spellingItems: mergeRecordLists(local.spellingItems, cloud.spellingItems),
          spellingProgress: mergeRecordMaps(local.spellingProgress, cloud.spellingProgress),
          profile: chooseNewest(cloud.profile, local.profile) || {},
          migrations: { ...(cloud.migrations || {}), ...(local.migrations || {}) }
        };
      }
      const practiceSessionMinutes = session => Math.max(5, Math.min(60, Math.round((new Date(session.finishedAt) - new Date(session.startedAt)) / 60000) || 5));
      function migrateStoredState(parsed) {
        parsed.migrations = parsed.migrations && typeof parsed.migrations === "object" ? parsed.migrations : {};
        let changed = false;
        if (!parsed.migrations.typedPracticeActivityV1) {
          for (const session of parsed.practiceSessions || []) {
            if (!session?.progressRecordedAt || !["conversation", "roleplay"].includes(session.mode)) continue;
            const entry = parsed.entries?.[session.date];
            if (!entry?.activities) continue;
            const speakingMinutes = Number(entry.activities.speaking) || 0;
            const movedMinutes = Math.min(speakingMinutes, practiceSessionMinutes(session));
            if (!movedMinutes) continue;
            if (speakingMinutes === movedMinutes) delete entry.activities.speaking;
            else entry.activities.speaking = speakingMinutes - movedMinutes;
            entry.activities.chat = (Number(entry.activities.chat) || 0) + movedMinutes;
            if (entry.notes) entry.notes = entry.notes.replace(`Practice Zone: ${session.mode === "roleplay" ? "Role-play" : "Guided conversation"}`, `Practice Zone text chat: ${session.mode === "roleplay" ? "Role-play" : "Guided conversation"}`);
            changed = true;
          }
          parsed.migrations.typedPracticeActivityV1 = new Date().toISOString();
          changed = true;
        }
        if (!parsed.migrations.practiceScoreScaleV1) {
          for (const session of parsed.practiceSessions || []) {
            const scores = session?.review?.scores;
            if (!scores) continue;
            const values = Object.values(scores).map(value => Number(value) || 0);
            if (!values.some(Boolean) || !values.every(value => value <= 10)) continue;
            const oldOverall = Math.round(Number(scores.overall) || 0);
            for (const key of Object.keys(scores)) scores[key] = Math.min(100, (Number(scores[key]) || 0) * 10);
            const entry = parsed.entries?.[session.date];
            if (entry?.notes) entry.notes = entry.notes.replace(`(${oldOverall}/100)`, `(${Math.round(Number(scores.overall) || 0)}/100)`);
            changed = true;
          }
          parsed.migrations.practiceScoreScaleV1 = new Date().toISOString();
          changed = true;
        }
        if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
      }
      const loadState = () => {
        try {
          const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
          if (!parsed || !parsed.entries) return emptyState();
          return migrateStoredState(normalizeStateShape(parsed));
        } catch { return emptyState(); }
      };
      function saveState(nextState, options = {}) {
        const cachedAccount = STORAGE_KEY.split(":account:")[1];
        if (cachedAccount && readStorage(ACTIVE_ACCOUNT_KEY) !== cachedAccount) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
        if (!options.skipSync) scheduleCloudSave();
      }
      let state = loadState();
      let accountUser = null;
      let serverConfig = { googleSignIn: false, devLogin: false, keyStorage: false };
      let lastPushOk = true;
      let pendingPush = false;
      // Increases on every account switch; replies to older requests are ignored.
      let accountEpoch = 0;

      function learnerProfile() {
        const profile = state.profile || {};
        return {
          name: String(profile.name || "").trim(),
          level: String(profile.level || "").trim() || "advanced (about C1)",
          variety: ENGLISH_VARIETIES.includes(profile.variety) ? profile.variety : "American English",
          nativeLanguage: String(profile.nativeLanguage || "").trim(),
          goals: String(profile.goals || "").trim()
        };
      }
      const englishVariety = () => learnerProfile().variety;
      function learnerLine() {
        const profile = learnerProfile();
        return `${[`Learner: ${profile.name || "not named"}`, `level: ${profile.level}`, profile.nativeLanguage ? `first language: ${profile.nativeLanguage}` : "", profile.goals ? `goals: ${profile.goals}` : ""].filter(Boolean).join("; ")}.`;
      }
      function renderVariety() {
        const eyebrow = document.querySelector("#varietyEyebrow");
        if (eyebrow) eyebrow.textContent = `Natural ${englishVariety()}`;
      }
      let syncConnected = false;
      let syncBusy = false;
      let syncRevision = 0;
      let syncSaveTimer = null;
      let lastCloudPullAt = 0;
      let studyItems = [];
      let studyOptionPool = [];
      let studyIndex = 0;
      let studyMode = "cards";
      let studySessionStats = { initial: 0, right: 0, again: 0 };
      let pendingStudyResult = null;
      let currentQuiz = null;
      let studyStartedAt = 0;
      let studyProgressLogged = false;
      const selectedReviewIds = new Set();
      let progressView = "month";
      let progressAnchor = parseDate(localDate());
      const trackerTabIds = ["today", "practice", "schedule", "sessions", "library", "writing", "study", "spelling", "progress", "handoff", "settings"];

      function loadDailyDrafts() {
        try {
          const drafts = JSON.parse(localStorage.getItem(DAILY_DRAFTS_KEY));
          return drafts && typeof drafts === "object" && !Array.isArray(drafts) ? drafts : {};
        } catch { return {}; }
      }

      function dailyDraftFor(date) {
        const drafts = loadDailyDrafts();
        const draft = drafts[date];
        return draft?.entry || null;
      }

      function saveDailyDraft(options = {}) {
        const date = $("#entryDate").value || localDate();
        const drafts = loadDailyDrafts();
        drafts[date] = { entry: collectForm(), savedAt: new Date().toISOString() };
        localStorage.setItem(DAILY_DRAFTS_KEY, JSON.stringify(drafts));
        if (options.announce) {
          $("#saveState").textContent = "Draft saved automatically on this device.";
          clearTimeout(saveDailyDraft.noticeTimer);
          saveDailyDraft.noticeTimer = setTimeout(() => $("#saveState").textContent = "", 1800);
        }
      }

      function clearDailyDraft(date) {
        const drafts = loadDailyDrafts();
        if (!drafts[date]) return;
        delete drafts[date];
        localStorage.setItem(DAILY_DRAFTS_KEY, JSON.stringify(drafts));
      }

      function handleDailyFormChange() {
        updateChatMessage();
        saveDailyDraft({ announce: true });
      }

      function openTrackerTab(tabId, options = {}) {
        const next = trackerTabIds.includes(tabId) ? tabId : "today";
        $$('[data-tab-panel]').forEach(panel => {
          const active = panel.dataset.tabPanel === next;
          panel.hidden = !active;
          panel.setAttribute("aria-hidden", String(!active));
        });
        $$('.jump-nav [data-tab]').forEach(tab => {
          const active = tab.dataset.tab === next;
          tab.setAttribute("aria-selected", String(active));
          tab.tabIndex = active ? 0 : -1;
        });
        const nav = document.querySelector(".jump-nav");
        const activeTab = nav?.querySelector(`[data-tab="${next}"]`);
        if (nav && activeTab) {
          requestAnimationFrame(() => {
            const left = activeTab.offsetLeft - ((nav.clientWidth - activeTab.offsetWidth) / 2);
            nav.scrollTo({ left: Math.max(0, left), behavior: options.instant ? "auto" : "smooth" });
          });
        }
        if (options.updateHash && location.hash !== `#${next}`) history.pushState({ trackerTab: next }, "", `#${next}`);
        if (options.scroll) document.querySelector(".jump-nav")?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (options.focus) document.querySelector(`.jump-nav [data-tab="${next}"]`)?.focus();
        if (next === "handoff") renderProjectHandoff();
        return next;
      }
      window.openTrackerTab = openTrackerTab;

      function renderActivities() {
        $("#activityGrid").innerHTML = activities.map(item => `
          <label class="activity" data-activity="${item.id}">
            <input type="checkbox" aria-label="${item.name}" />
            <span class="activity-copy"><strong>${item.name}</strong><small>${item.hint}</small></span>
            <span class="minutes"><input type="number" min="0" max="300" step="1" value="${item.suggested}" aria-label="Minutes for ${item.name}" /></span>
          </label>
        `).join("");

        $$(".activity").forEach(card => {
          const checkbox = card.querySelector('input[type="checkbox"]');
          const minutes = card.querySelector('input[type="number"]');
          const sync = () => {
            card.classList.toggle("checked", checkbox.checked);
            handleDailyFormChange();
          };
          checkbox.addEventListener("change", sync);
          minutes.addEventListener("input", handleDailyFormChange);
        });
      }

      function renderSchedule() {
        const todayDay = new Date().getDay();
        const todayPlan = weeklyPriorities.find(item => item.day === todayDay);
        const total = Object.values(todayPlan.activities).reduce((sum, value) => sum + value, 0);
        $("#todayPriority").innerHTML = `<p class="eyebrow">Today’s priority</p><h3>${escapeHtml(todayPlan.name)}</h3><p>${escapeHtml(todayPlan.detail)}</p><p><strong>${total} suggested minutes</strong></p><button class="btn primary" id="loadTodayPlanBtn" type="button" style="margin-top:14px">Load today’s plan</button>`;
        $("#weeklySchedule").innerHTML = weeklyPriorities.map(plan => {
          const date = new Date(2024, 0, 7 + plan.day);
          const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
          const tags = Object.keys(plan.activities).map(id => `<span class="tag" style="border-left:3px solid ${activityColors[id]}">${escapeHtml(activities.find(item => item.id === id)?.short || id)}</span>`).join("");
          return `<article class="schedule-card ${plan.day === todayDay ? "today" : ""}"><strong>${dayName} · ${escapeHtml(plan.name)}</strong><small>${escapeHtml(plan.detail)}</small>${tags}</article>`;
        }).join("");
        $("#loadTodayPlanBtn").addEventListener("click", () => {
          const date = localDate();
          $("#entryDate").value = date;
          setForm(state.entries[date] || null);
          for (const [id, minutes] of Object.entries(todayPlan.activities)) {
            const card = $(`.activity[data-activity="${id}"]`);
            if (!card) continue;
            card.querySelector('input[type="checkbox"]').checked = true;
            card.querySelector('input[type="number"]').value = minutes;
            card.classList.add("checked");
          }
          saveDailyDraft();
          updateChatMessage();
          showToast("Today’s priorities are loaded. Adjust anything you need, then save the day.");
          openTrackerTab("today", { updateHash: true, scroll: true });
        });
      }

      function writingWordCount(text) {
        return String(text || "").trim().split(/\s+/).filter(Boolean).length;
      }

      function updateWritingWordCount() {
        const count = writingWordCount($("#writingDraft").value);
        const target = Math.max(0, Number($("#writingTarget").value) || 0);
        $("#writingWordCount").textContent = `${count} word${count === 1 ? "" : "s"}${target ? ` · target ${target}` : ""}`;
      }

      function collectWritingForm() {
        const date = $("#writingDate").value || localDate();
        const existing = state.writings[date];
        const draft = $("#writingDraft").value.trim();
        const unchanged = existing?.draft === draft;
        return {
          id: existing?.id || makeId(), date, type: $("#writingType").value,
          prompt: $("#writingPrompt").value.trim(), targetWords: Math.max(0, Number($("#writingTarget").value) || 0),
          targetItems: $("#writingTargets").value.split(",").map(value => value.trim()).filter(Boolean).slice(0, 5),
          draft, checks: $$("#writingChecklist input:checked").map(input => input.value),
          review: unchanged ? existing?.review || null : null,
          rewrite: unchanged ? existing?.rewrite || "" : "",
          finalizedAt: unchanged ? existing?.finalizedAt || null : null,
          createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        };
      }

      function setWritingForm(record = null, date = localDate()) {
        const value = record || { date, type: "casual_message", prompt: "", targetWords: 150, targetItems: [], draft: "", checks: [] };
        $("#writingDate").value = value.date || date;
        $("#writingType").value = value.type || "casual_message";
        $("#writingPrompt").value = value.prompt || "";
        $("#writingTarget").value = value.targetWords || 150;
        $("#writingTargets").value = (value.targetItems || []).join(", ");
        $("#writingDraft").value = value.draft || "";
        $$("#writingChecklist input").forEach(input => input.checked = (value.checks || []).includes(input.value));
        updateWritingWordCount();
        renderWritingFeedback(value.review ? value : null);
      }

      function renderWritingHistory() {
        const records = Object.values(state.writings).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        $("#writingCount").textContent = `${records.length} draft${records.length === 1 ? "" : "s"}`;
        if (!records.length) {
          $("#writingHistory").innerHTML = '<div class="empty">Your saved drafts will appear here.</div>';
          return;
        }
        $("#writingHistory").innerHTML = records.map(record => `<button class="writing-history-item" type="button" data-writing-date="${escapeHtml(record.date)}"><strong>${formatDate(record.date, { month: "short", day: "numeric", year: "numeric" })} · ${escapeHtml(writingTypeLabels[record.type] || "Writing")}</strong><small>${writingWordCount(record.draft)} words · ${record.finalizedAt ? "Rewritten and finalized" : record.review ? "Feedback received" : "Draft"}</small></button>`).join("");
      }

      function renderWritingFeedback(record) {
        if (!record?.review) {
          $("#writingFeedback").innerHTML = "";
          return;
        }
        const review = record.review;
        const corrections = (review.key_corrections || []).map(item => `<div class="feedback-card"><strong>${escapeHtml(item.category || "Correction")}</strong><span>${escapeHtml(item.original || "")} → ${escapeHtml(item.corrected || "")}</span><small>${escapeHtml(item.explanation || "")}</small></div>`).join("");
        const targetResults = (review.target_results || []).map(item => `<div class="feedback-card"><strong>${escapeHtml(item.target || "Learning target")} · ${escapeHtml(String(item.status || "").replaceAll("_", " "))}</strong><span>${escapeHtml(item.evidence || item.feedback || "")}</span>${item.evidence && item.feedback ? `<small>${escapeHtml(item.feedback)}</small>` : ""}</div>`).join("");
        $("#writingFeedback").innerHTML = `<div class="feedback-card"><strong>Overall feedback</strong><span>${escapeHtml(review.overall_feedback || "")}</span></div><div class="feedback-card"><strong>Corrected version</strong><div class="corrected-writing">${escapeHtml(review.corrected_text || "")}</div></div>${corrections}${targetResults}<label class="field"><span>Rewrite from memory</span><textarea class="writing-rewrite" id="writingRewrite" placeholder="Rewrite the piece without copying the corrected version.">${escapeHtml(record.rewrite || "")}</textarea></label><div class="action-row"><button class="btn primary" type="button" data-writing-action="finalize">Save rewrite &amp; finalize</button>${record.finalizedAt ? '<span class="save-state">Finalized ✓</span>' : ""}</div>`;
      }

      function saveWritingDraft(showMessage = true) {
        const record = collectWritingForm();
        if (!record.draft) {
          $("#writingSaveState").textContent = "Write a draft before saving.";
          return null;
        }
        state.writings[record.date] = record;
        saveState(state);
        renderWritingHistory();
        renderWritingFeedback(record);
        renderProgress();
        if (showMessage) {
          $("#writingSaveState").textContent = "Draft saved.";
          setTimeout(() => $("#writingSaveState").textContent = "", 2500);
        }
        return record;
      }

      function makeWritingReviewPrompt(record) {
        return `Please review this writing for an English learner who wants natural, educated ${englishVariety()}. ${learnerLine()}

Focus on grammar, vocabulary, collocations, phrasal verbs, clarity, register, and natural flow. Preserve my intended meaning and voice. Identify only the most useful corrections, not every stylistic possibility. Create reusable learning items only for mistakes worth practicing again, with at most three items.

Return ONLY valid JSON with this exact shape—no Markdown or commentary outside the JSON:
{
  "writing_review_version": 1,
  "date": "${record.date}",
  "corrected_text": "complete corrected version",
  "overall_feedback": "brief feedback on strengths and priorities",
  "key_corrections": [
    { "category": "grammar|vocabulary|collocation|phrasal_verb|register|punctuation|clarity", "original": "original wording", "corrected": "better wording", "explanation": "brief explanation" }
  ],
  "target_results": [
    { "target": "one requested library item", "status": "used_naturally|needs_correction|not_used", "evidence": "learner wording or empty", "feedback": "brief feedback" }
  ],
  "reusable_items": [
    { "type": "grammar|collocation|phrasal_verb|vocabulary", "front": "reusable point", "back": "meaning or rule", "example": "natural example" }
  ]
}

Writing details:
${JSON.stringify({ date: record.date, type: writingTypeLabels[record.type], prompt: record.prompt, target_items: record.targetItems, draft: record.draft }, null, 2)}`;
      }

      async function copyWritingReview() {
        const record = saveWritingDraft(false);
        if (!record) return;
        try {
          await copyText(makeWritingReviewPrompt(record));
          showToast("Writing review prompt copied. Paste it into your AI chat, then paste the JSON reply below.");
        } catch {
          showToast("Your browser blocked copying. Allow clipboard access and try again.", "error");
        }
      }

      function parseJsonPackage(raw, label) {
        const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error(`I could not find the JSON ${label} package.`);
        return JSON.parse(text.slice(start, end + 1));
      }

      function applyWritingReview(input) {
        try {
          const payload = input && typeof input === "object" ? input : parseJsonPackage($("#writingReviewPackage").value, "writing-review");
          if (payload.writing_review_version !== 1 || !payload.date) throw new Error("This is not a compatible writing-review package.");
          const record = state.writings[payload.date];
          if (!record) throw new Error("The matching saved draft was not found.");
          record.review = {
            corrected_text: String(payload.corrected_text || "").trim(),
            overall_feedback: String(payload.overall_feedback || "").trim(),
            key_corrections: Array.isArray(payload.key_corrections) ? payload.key_corrections.slice(0, 8) : [],
            target_results: Array.isArray(payload.target_results) ? payload.target_results.slice(0, 8) : [],
            reviewedAt: new Date().toISOString()
          };
          record.updatedAt = new Date().toISOString();
          for (const result of record.review.target_results) {
            const target = String(result?.target || "").trim().toLowerCase();
            const libraryItem = state.library.find(item => item.front.toLowerCase() === target);
            if (!libraryItem) continue;
            if (result.status === "used_naturally") recordLearningOutcome(libraryItem.id, "right", "writing target");
            else if (result.status === "needs_correction") recordLearningOutcome(libraryItem.id, "again", "writing target mistake");
          }
          const validTypes = new Set(["grammar", "collocation", "phrasal_verb", "vocabulary"]);
          let created = 0;
          for (const item of (Array.isArray(payload.reusable_items) ? payload.reusable_items.slice(0, 3) : [])) {
            if (!item || !validTypes.has(item.type)) continue;
            const front = String(item.front || "").trim();
            const back = String(item.back || "").trim();
            if (!front || !back) continue;
            const existing = state.library.find(value => value.type === item.type && value.front.toLowerCase() === front.toLowerCase());
            if (existing) {
              recordLearningOutcome(existing.id, "again", "writing mistake");
              continue;
            }
            const newItem = { id: makeId(), type: item.type, front, back, example: String(item.example || "").trim(), source: `Created from writing on ${record.date}`, tags: ["writing-mistake", "AI-created"], review: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            state.library.push(newItem);
            recordLearningOutcome(newItem.id, "again", "writing mistake");
            created++;
          }
          saveState(state);
          $("#writingDate").value = payload.date;
          setWritingForm(record, payload.date);
          renderWritingHistory();
          renderLibrary();
          $("#writingReviewPackage").value = "";
          showToast(`Writing feedback applied${created ? ` and ${created} learning item${created === 1 ? " was" : "s were"} created` : ""}.`);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "The writing review could not be applied.", "error");
        }
      }

      function finalizeWriting() {
        const date = $("#writingDate").value;
        const record = state.writings[date];
        const rewrite = $("#writingRewrite")?.value.trim() || "";
        if (!record?.review || !rewrite) {
          showToast("Write your own revised version before finalizing.", "error");
          return;
        }
        record.rewrite = rewrite;
        record.finalizedAt = new Date().toISOString();
        record.updatedAt = new Date().toISOString();
        saveState(state);
        renderWritingFeedback(record);
        renderWritingHistory();
        renderProgress();
        showToast("Rewrite saved and finalized.");
      }

      function syncSessionFields() {
        const type = $("#sessionType").value;
        const config = sessionFieldConfig[type] || sessionFieldConfig.listening;
        $("#sessionSourceLabel").textContent = config.source;
        $("#sessionDetailLabel").textContent = config.detail;
        $("#sessionQuantityLabel").textContent = config.quantity;
        $("#sessionEvidenceLabel").textContent = config.evidence;
        $("#sessionEvidence").placeholder = config.evidencePlaceholder;
        $("#voiceRecorder").hidden = !["shadowing", "speaking"].includes(type);
      }

      function sessionContentSignature(record) {
        return JSON.stringify({
          date: record.date, type: record.type, minutes: record.minutes, rating: record.rating,
          source: record.source, url: record.url, detail: record.detail, quantity: record.quantity,
          evidence: record.evidence, phrases: record.phrases, question: record.question
        });
      }

      function collectSessionForm() {
        const id = $("#sessionEditId").value;
        const existing = state.sessions.find(record => record.id === id);
        const record = {
          id: existing?.id || makeId(), date: $("#sessionDate").value || localDate(), type: $("#sessionType").value,
          minutes: Math.max(0, Number($("#sessionMinutes").value) || 0), rating: Math.min(5, Math.max(1, Number($("#sessionRating").value) || 3)),
          source: $("#sessionSource").value.trim(), url: $("#sessionUrl").value.trim(), detail: $("#sessionDetail").value.trim(),
          quantity: Math.max(0, Number($("#sessionQuantity").value) || 0), evidence: $("#sessionEvidence").value.trim(),
          phrases: $("#sessionPhrases").value.split("\n").map(value => value.trim()).filter(Boolean).slice(0, 8),
          question: $("#sessionQuestion").value.trim(), review: null, finalizedAt: null,
          createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        const unchanged = existing && sessionContentSignature(existing) === sessionContentSignature(record);
        if (unchanged) {
          record.review = existing.review || null;
          record.finalizedAt = existing.finalizedAt || null;
        }
        return record;
      }

      function setSessionForm(record = null, date = localDate()) {
        const value = record || { id: "", date, type: "listening", minutes: 15, rating: 3, source: "", url: "", detail: "", quantity: 0, evidence: "", phrases: [], question: "" };
        $("#sessionEditId").value = value.id || "";
        $("#sessionDate").value = value.date || date;
        $("#sessionType").value = value.type || "listening";
        $("#sessionMinutes").value = value.minutes ?? 15;
        $("#sessionRating").value = value.rating || 3;
        $("#sessionSource").value = value.source || "";
        $("#sessionUrl").value = value.url || "";
        $("#sessionDetail").value = value.detail || "";
        $("#sessionQuantity").value = value.quantity || 0;
        $("#sessionEvidence").value = value.evidence || "";
        $("#sessionPhrases").value = (value.phrases || []).join("\n");
        $("#sessionQuestion").value = value.question || "";
        $("#saveSessionBtn").textContent = value.id ? "Update session" : "Save session";
        $("#sessionSaveState").textContent = "";
        syncSessionFields();
        renderSessionFeedback(value.id ? value : null);
      }

      function clearSessionForm() {
        const date = $("#sessionDate").value || localDate();
        resetRecording();
        setSessionForm(null, date);
        $("#sessionReviewPackage").value = "";
        $("#sessionSaveState").textContent = "Form cleared. Saved sessions were not deleted.";
      }

      function saveSession(showMessage = true) {
        const record = collectSessionForm();
        if (!record.source && !record.evidence && !record.question) {
          $("#sessionSaveState").textContent = "Add a source, summary, or question before saving.";
          return null;
        }
        const index = state.sessions.findIndex(value => value.id === record.id);
        if (index >= 0) state.sessions[index] = record;
        else state.sessions.push(record);
        saveState(state);
        $("#sessionEditId").value = record.id;
        $("#saveSessionBtn").textContent = "Update session";
        renderSessionHistory();
        renderSessionFeedback(record);
        renderProgress();
        if (showMessage) {
          $("#sessionSaveState").textContent = index >= 0 ? "Session updated." : "Session saved.";
          setTimeout(() => $("#sessionSaveState").textContent = "", 2500);
        }
        return record;
      }

      function renderSessionHistory() {
        const filter = $("#sessionFilter").value;
        const query = $("#sessionSearch").value.trim().toLowerCase();
        const records = state.sessions
          .filter(record => filter === "all" || record.type === filter)
          .filter(record => !query || [record.source, record.detail, record.evidence, record.question, ...(record.phrases || [])].join(" ").toLowerCase().includes(query))
          .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
        $("#sessionCount").textContent = `${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;
        if (!records.length) {
          $("#sessionHistory").innerHTML = `<div class="empty">${state.sessions.length ? "No sessions match this filter." : "Your listening, reading, shadowing, and speaking records will appear here."}</div>`;
          return;
        }
        $("#sessionHistory").innerHTML = records.map(record => `<button class="session-history-item" type="button" data-session-id="${escapeHtml(record.id)}" style="--activity-color:${activityColors[record.type]}"><strong>${formatDate(record.date, { month: "short", day: "numeric", year: "numeric" })} · ${escapeHtml(sessionTypeLabels[record.type] || record.type)}</strong><span>${escapeHtml(record.source || record.detail || "Untitled session")}</span><small>${Number(record.minutes) || 0} min · confidence ${Number(record.rating) || 3}/5 · ${record.finalizedAt ? "review finalized" : record.review ? "feedback received" : "ready for review"}</small></button>`).join("");
      }

      function renderSessionFeedback(record) {
        if (!record?.review) {
          $("#sessionFeedback").innerHTML = "";
          return;
        }
        if (record.finalizedAt) {
          $("#sessionFeedback").innerHTML = '<div class="feedback-card"><strong>Activity feedback finalized ✓</strong><span>The corrections and reusable learning cards have been saved.</span></div>';
          return;
        }
        const review = record.review;
        const phraseCorrections = (review.phrase_corrections || []).map(item => `<div class="feedback-card"><strong>${escapeHtml(item.original || "Phrase")}</strong><span>${escapeHtml(item.corrected || "")}</span><small>${escapeHtml(item.explanation || "")}</small></div>`).join("");
        $("#sessionFeedback").innerHTML = `<div class="feedback-card"><strong>Overall feedback</strong><span>${escapeHtml(review.overall_feedback || "")}</span></div>${review.corrected_evidence ? `<div class="feedback-card"><strong>Natural corrected version</strong><span>${escapeHtml(review.corrected_evidence)}</span></div>` : ""}${review.understanding_notes ? `<div class="feedback-card"><strong>Understanding</strong><span>${escapeHtml(review.understanding_notes)}</span></div>` : ""}${phraseCorrections}${review.pronunciation_notes ? `<div class="feedback-card"><strong>Pronunciation and delivery</strong><span>${escapeHtml(review.pronunciation_notes)}</span></div>` : ""}<div class="action-row"><button class="btn primary" type="button" data-session-action="finalize" data-session-id="${escapeHtml(record.id)}">Accept &amp; finalize</button></div>`;
      }

      function makeSessionReviewPrompt(record) {
        return `Please review this English practice session for a learner who wants natural, fluent ${englishVariety()}. ${learnerLine()}

Adapt the feedback to the activity. For listening or reading, check the learner’s summary and interpretation only from the information supplied; do not pretend to have opened or verified the source. For shadowing or speaking, assess pronunciation, rhythm, and delivery only if an audio clip is attached; otherwise say that pronunciation was not assessed. Correct unnatural grammar and phrasing, explain useful nuances, and create at most three genuinely reusable learning items.

Return ONLY valid JSON with this exact shape—no Markdown or commentary outside the JSON:
{
  "activity_review_version": 1,
  "session_id": "${record.id}",
  "overall_feedback": "brief practical feedback",
  "corrected_evidence": "natural corrected version of the learner’s summary or explanation",
  "understanding_notes": "what was understood well and what may need another listen or read",
  "phrase_corrections": [
    { "original": "learner wording", "corrected": "natural wording", "explanation": "brief explanation" }
  ],
  "pronunciation_notes": "feedback based on attached audio, or say not assessed",
  "reusable_items": [
    { "type": "grammar|collocation|phrasal_verb|vocabulary", "front": "reusable point", "back": "meaning or rule", "example": "natural example" }
  ]
}

Session details:
${JSON.stringify({ id: record.id, date: record.date, activity: sessionTypeLabels[record.type], minutes: record.minutes, confidence: record.rating, source: record.source, link: record.url, detail: record.detail, quantity: record.quantity, learner_evidence: record.evidence, useful_phrases: record.phrases, learner_question: record.question }, null, 2)}`;
      }

      async function copySessionReview() {
        const record = saveSession(false);
        if (!record) return;
        try {
          await copyText(makeSessionReviewPrompt(record));
          showToast(["shadowing", "speaking"].includes(record.type) ? "Review prompt copied. Paste it into your AI chat and attach your voice clip if you recorded one." : "Review prompt copied. Paste it into your AI chat, then paste the JSON reply below.");
        } catch {
          showToast("Your browser blocked copying. Allow clipboard access and try again.", "error");
        }
      }

      function applySessionReview(input) {
        try {
          const payload = input && typeof input === "object" ? input : parseJsonPackage($("#sessionReviewPackage").value, "activity-review");
          if (payload.activity_review_version !== 1 || !payload.session_id) throw new Error("This is not a compatible activity-review package.");
          const record = state.sessions.find(value => value.id === payload.session_id);
          if (!record) throw new Error("The matching saved session was not found.");
          record.review = {
            overall_feedback: String(payload.overall_feedback || "").trim(), corrected_evidence: String(payload.corrected_evidence || "").trim(),
            understanding_notes: String(payload.understanding_notes || "").trim(), phrase_corrections: Array.isArray(payload.phrase_corrections) ? payload.phrase_corrections.slice(0, 8) : [],
            pronunciation_notes: String(payload.pronunciation_notes || "").trim(), reviewedAt: new Date().toISOString()
          };
          record.finalizedAt = null;
          record.updatedAt = new Date().toISOString();
          const validTypes = new Set(["grammar", "collocation", "phrasal_verb", "vocabulary"]);
          let created = 0;
          for (const item of (Array.isArray(payload.reusable_items) ? payload.reusable_items.slice(0, 3) : [])) {
            if (!item || !validTypes.has(item.type)) continue;
            const front = String(item.front || "").trim();
            const back = String(item.back || "").trim();
            if (!front || !back || state.library.some(value => value.type === item.type && value.front.toLowerCase() === front.toLowerCase())) continue;
            state.library.push({ id: makeId(), type: item.type, front, back, example: String(item.example || "").trim(), source: `Created from ${sessionTypeLabels[record.type].toLowerCase()} practice on ${record.date}`, tags: ["activity-mistake", "AI-created"], review: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            created++;
          }
          saveState(state);
          setSessionForm(record, record.date);
          renderSessionHistory();
          renderLibrary();
          renderProgress();
          $("#sessionReviewPackage").value = "";
          showToast(`Activity feedback applied${created ? ` and ${created} learning item${created === 1 ? " was" : "s were"} created` : ""}.`);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "The activity review could not be applied.", "error");
        }
      }

      function finalizeSessionReview(id) {
        const record = state.sessions.find(value => value.id === id);
        if (!record?.review) return;
        record.finalizedAt = new Date().toISOString();
        record.updatedAt = new Date().toISOString();
        saveState(state);
        renderSessionFeedback(record);
        renderSessionHistory();
        showToast("Activity feedback accepted and finalized.");
      }

      let mediaRecorder = null;
      let recordingChunks = [];
      let recordingUrl = "";
      let recordingStream = null;

      function resetRecording() {
        if (mediaRecorder?.state === "recording") mediaRecorder.stop();
        recordingStream?.getTracks().forEach(track => track.stop());
        recordingStream = null;
        mediaRecorder = null;
        recordingChunks = [];
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recordingUrl = "";
        $("#recordingPlayback").removeAttribute("src");
        $("#recordingPlayback").hidden = true;
        $("#downloadRecordingBtn").hidden = true;
        $("#startRecordingBtn").disabled = false;
        $("#stopRecordingBtn").disabled = true;
        $("#recordingState").textContent = "";
      }

      async function startRecording() {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          showToast("Voice recording is not supported in this browser.", "error");
          return;
        }
        try {
          resetRecording();
          recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(recordingStream);
          recordingChunks = [];
          mediaRecorder.addEventListener("dataavailable", event => { if (event.data.size) recordingChunks.push(event.data); });
          mediaRecorder.addEventListener("stop", () => {
            const blob = new Blob(recordingChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
            recordingUrl = URL.createObjectURL(blob);
            $("#recordingPlayback").src = recordingUrl;
            $("#recordingPlayback").hidden = false;
            $("#downloadRecordingBtn").href = recordingUrl;
            $("#downloadRecordingBtn").download = `english-${$("#sessionType").value}-${$("#sessionDate").value || localDate()}.webm`;
            $("#downloadRecordingBtn").hidden = false;
            $("#recordingState").textContent = "Clip ready. Download it before leaving this page.";
            recordingStream?.getTracks().forEach(track => track.stop());
            recordingStream = null;
          });
          mediaRecorder.start();
          $("#startRecordingBtn").disabled = true;
          $("#stopRecordingBtn").disabled = false;
          $("#recordingState").textContent = "Recording…";
        } catch {
          showToast("Microphone access was blocked. Allow it in your browser settings and try again.", "error");
        }
      }

      function stopRecording() {
        if (mediaRecorder?.state === "recording") mediaRecorder.stop();
        $("#startRecordingBtn").disabled = false;
        $("#stopRecordingBtn").disabled = true;
      }

      function selectedStatus() {
        return $('input[name="status"]:checked')?.value || "practiced";
      }

      function collectForm() {
        const done = {};
        $$(".activity").forEach(card => {
          if (card.querySelector('input[type="checkbox"]').checked) {
            done[card.dataset.activity] = Math.max(0, Number(card.querySelector('input[type="number"]').value) || 0);
          }
        });
        return {
          status: selectedStatus(),
          activities: done,
          phrases: $$(".phrase").map(input => input.value.trim()).filter(Boolean).slice(0, 3),
          question: $("#question").value.trim(),
          correction: $("#correction").value.trim(),
          notes: $("#notes").value.trim(),
          updatedAt: new Date().toISOString()
        };
      }

      function setForm(entry) {
        const value = entry || { status: "practiced", activities: {}, phrases: [], question: "", correction: "", notes: "" };
        const status = document.querySelector(`input[name="status"][value="${value.status || "practiced"}"]`);
        if (status) status.checked = true;
        $$(".activity").forEach(card => {
          const checked = Object.prototype.hasOwnProperty.call(value.activities || {}, card.dataset.activity);
          card.querySelector('input[type="checkbox"]').checked = checked;
          if (checked) card.querySelector('input[type="number"]').value = value.activities[card.dataset.activity];
          else card.querySelector('input[type="number"]').value = activities.find(a => a.id === card.dataset.activity).suggested;
          card.classList.toggle("checked", checked);
        });
        $$(".phrase").forEach((input, index) => input.value = value.phrases?.[index] || "");
        $("#question").value = value.question || "";
        $("#correction").value = value.correction || "";
        $("#notes").value = value.notes || "";
        updateChatMessage();
      }

      function totalMinutes(entry) {
        return Object.values(entry.activities || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
      }

      function makeMessage(date, entry) {
        const done = activities
          .filter(item => Object.prototype.hasOwnProperty.call(entry.activities || {}, item.id))
          .map(item => `${item.name} (${entry.activities[item.id]} min)`);
        const lines = [`Daily English check-in — ${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`];
        if (entry.status === "rest") lines.push("Status: Rest / skipped day. Please give me the 5-minute catch-up unless I choose to rest fully.");
        else lines.push(`Status: ${entry.status === "light" ? "Light day" : "Practiced"}`);
        lines.push(`Activities: ${done.length ? done.join("; ") : "None recorded"}`);
        if (entry.phrases?.length) lines.push(`Phrases/chunks: ${entry.phrases.map(p => `“${p}”`).join("; ")}`);
        if (entry.question) lines.push(`My grammar/language question: ${entry.question}`);
        if (entry.correction) lines.push(`Correction or recurring mistake: ${entry.correction}`);
        if (entry.notes) lines.push(`Reflection: ${entry.notes}`);
        lines.push("Please discuss my phrases or question with me, correct my examples naturally, note any recurring pattern, and finish with a short progress log plus one focus for tomorrow.");
        return lines.join("\n");
      }

      function updateChatMessage() {
        $("#chatMessage").value = makeMessage($("#entryDate").value || localDate(), collectForm());
      }

      function getWindow(days) {
        const result = [];
        const today = parseDate(localDate());
        for (let i = 0; i < days; i++) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          const key = localDate(date);
          result.push({ date: key, entry: state.entries[key] || null });
        }
        return result;
      }

      function sessionsOnDate(dateKey) {
        return state.sessions.filter(record => record.date === dateKey);
      }

      function activityMinutesForDate(dateKey, activityId) {
        const detailed = sessionsOnDate(dateKey).filter(record => record.type === activityId);
        if (detailed.length) return detailed.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
        return Number(state.entries[dateKey]?.activities?.[activityId]) || 0;
      }

      function effectiveMinutesForDate(dateKey) {
        return activities.reduce((sum, item) => sum + activityMinutesForDate(dateKey, item.id), 0);
      }

      function returnStreak() {
        let count = 0;
        const cursor = parseDate(localDate());
        for (let i = 0; i < 365; i++) {
          const key = localDate(cursor);
          const entry = state.entries[key];
          const writing = state.writings[key];
          const sessions = sessionsOnDate(key);
          if (!entry && !writing?.draft && !sessions.length) break;
          if ((writing?.draft || sessions.length) && (!entry || entry.status === "rest")) count++;
          else if (entry.status !== "rest" && (Object.keys(entry.activities || {}).length || totalMinutes(entry))) count++;
          else if (entry.status !== "rest") count++;
          else break;
          cursor.setDate(cursor.getDate() - 1);
        }
        return count;
      }

      function addDays(date, amount) {
        const result = new Date(date);
        result.setDate(result.getDate() + amount);
        return result;
      }

      function startOfWeek(date) {
        const result = new Date(date);
        const offset = (result.getDay() + 6) % 7;
        result.setDate(result.getDate() - offset);
        result.setHours(12, 0, 0, 0);
        return result;
      }

      function datesBetween(start, end) {
        const dates = [];
        for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) dates.push(new Date(cursor));
        return dates;
      }

      function getProgressRange() {
        const anchor = new Date(progressAnchor);
        let start;
        let end;
        let label;
        if (progressView === "day") {
          start = new Date(anchor);
          end = new Date(anchor);
          label = anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        } else if (progressView === "week") {
          start = startOfWeek(anchor);
          end = addDays(start, 6);
          label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        } else if (progressView === "year") {
          start = new Date(anchor.getFullYear(), 0, 1, 12);
          end = new Date(anchor.getFullYear(), 11, 31, 12);
          label = String(anchor.getFullYear());
        } else {
          start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
          end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
          label = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        }
        return { start, end, label };
      }

      function libraryItemsCreatedOn(dateKey) {
        return state.library.filter(item => {
          const value = item.createdAt || item.updatedAt;
          if (!value) return false;
          const created = new Date(value);
          return !Number.isNaN(created.getTime()) && localDate(created) === dateKey;
        });
      }

      function renderCalendarDay(date, outside = false) {
        const key = localDate(date);
        const entry = state.entries[key];
        const writing = state.writings[key];
        const detailedSessions = sessionsOnDate(key);
        const additions = libraryItemsCreatedOn(key).length;
        const dots = activities
          .filter(item => (entry && Object.prototype.hasOwnProperty.call(entry.activities || {}, item.id)) || detailedSessions.some(record => record.type === item.id) || (item.id === "writing" && writing?.draft))
          .map(item => `<span class="activity-dot" style="--activity-color:${activityColors[item.id]}" title="${escapeHtml(item.name)}"></span>`)
          .join("");
        const classes = ["calendar-day", outside ? "outside" : "", key === localDate() ? "today" : "", entry?.status === "rest" && !writing?.draft && !detailedSessions.length ? "rest" : ""].filter(Boolean).join(" ");
        const minutes = effectiveMinutesForDate(key);
        const title = `${formatDate(key, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}: ${minutes} practice minutes, ${detailedSessions.length} detailed sessions, ${writing?.draft ? `${writingWordCount(writing.draft)} written words, ` : ""}${additions} learning items added`;
        return `<button class="${classes}" type="button" data-calendar-date="${key}" title="${escapeHtml(title)}"><span class="calendar-day-number"><span>${date.getDate()}</span>${entry || writing?.draft || detailedSessions.length ? `<span class="calendar-minutes">${entry?.status === "rest" && !writing?.draft && !detailedSessions.length ? "Rest" : minutes ? `${minutes}m` : "Writing"}</span>` : ""}</span><span class="activity-dots">${dots}</span>${additions ? `<span class="calendar-additions">+${additions} learned</span>` : ""}</button>`;
      }

      function miniDayBackground(entry, dateKey) {
        if (entry?.status === "rest" && !state.writings[dateKey]?.draft && !sessionsOnDate(dateKey).length) return "background:#8a6817";
        const colors = activities
          .filter(item => (entry && Object.prototype.hasOwnProperty.call(entry.activities || {}, item.id)) || sessionsOnDate(dateKey).some(record => record.type === item.id) || (item.id === "writing" && state.writings[dateKey]?.draft))
          .map(item => activityColors[item.id]);
        if (!colors.length) return "";
        if (colors.length === 1) return `background:${colors[0]}`;
        const step = 100 / colors.length;
        return `background:conic-gradient(${colors.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`).join(",")})`;
      }

      function renderCalendar() {
        const range = getProgressRange();
        $("#calendarRangeLabel").textContent = range.label;
        $$("[data-calendar-view]").forEach(button => button.classList.toggle("active", button.dataset.calendarView === progressView));
        $("#calendarLegend").innerHTML = activities.map(item => `<span class="legend-item"><i class="legend-dot" style="--activity-color:${activityColors[item.id]}"></i>${item.short}</span>`).join("") + '<span class="legend-item"><i class="legend-dot" style="--activity-color:#8a6817"></i>Rest</span>';

        if (progressView === "day") {
          const key = localDate(range.start);
          const entry = state.entries[key];
          const writing = state.writings[key];
          const detailedSessions = sessionsOnDate(key);
          const additions = libraryItemsCreatedOn(key);
          let activityRows = activities
            .filter(item => entry && Object.prototype.hasOwnProperty.call(entry.activities || {}, item.id) && !detailedSessions.some(record => record.type === item.id))
            .map(item => `<div class="day-activity" style="--activity-color:${activityColors[item.id]}"><span>${item.name}</span><strong>${Number(entry.activities[item.id]) || 0} min</strong></div>`)
            .join("");
          activityRows += detailedSessions.map(record => `<div class="day-activity" style="--activity-color:${activityColors[record.type]}"><span>${escapeHtml(sessionTypeLabels[record.type])}${record.source ? ` · ${escapeHtml(record.source)}` : ""}</span><strong>${Number(record.minutes) || 0} min</strong></div>`).join("");
          if (writing?.draft && !entry?.activities?.writing) activityRows += `<div class="day-activity" style="--activity-color:${activityColors.writing}"><span>Writing draft</span><strong>${writingWordCount(writing.draft)} words</strong></div>`;
          $("#calendarView").innerHTML = `<div class="calendar-day-view"><h3>${entry?.status === "rest" && !writing?.draft && !detailedSessions.length ? "Rest day" : activityRows ? `${effectiveMinutesForDate(key)} minutes practiced` : "No practice recorded"}</h3><div class="day-activity-list">${activityRows || '<div class="empty">No activities recorded for this day.</div>'}</div>${additions.length ? `<p class="calendar-additions">${additions.length} learning item${additions.length === 1 ? "" : "s"} added: ${additions.map(item => escapeHtml(item.front)).join(", ")}</p>` : '<p class="help" style="margin-top:12px">No learning items added.</p>'}<button class="btn" type="button" data-calendar-date="${key}" style="margin-top:14px">Open this day in the daily check-in</button></div>`;
          return range;
        }

        if (progressView === "year") {
          const year = progressAnchor.getFullYear();
          const months = Array.from({ length: 12 }, (_, month) => {
            const monthStart = new Date(year, month, 1, 12);
            const monthEnd = new Date(year, month + 1, 0, 12);
            const gridStart = startOfWeek(monthStart);
            const gridEnd = addDays(startOfWeek(monthEnd), 6);
            const cells = datesBetween(gridStart, gridEnd).map(date => {
              const key = localDate(date);
              const entry = state.entries[key];
              const additions = libraryItemsCreatedOn(key).length;
              const outside = date.getMonth() !== month;
              const title = `${formatDate(key, { month: "long", day: "numeric", year: "numeric" })}: ${effectiveMinutesForDate(key)} minutes, ${additions} added`;
              return `<button class="mini-day ${outside ? "outside" : ""} ${key === localDate() ? "today" : ""}" type="button" data-calendar-date="${key}" style="${miniDayBackground(entry, key)}" title="${escapeHtml(title)}">${date.getDate()}</button>`;
            }).join("");
            return `<section class="mini-month"><h4>${monthStart.toLocaleDateString("en-US", { month: "long" })}</h4><div class="mini-weekdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="mini-grid">${cells}</div></section>`;
          }).join("");
          $("#calendarView").innerHTML = `<div class="year-calendar">${months}</div>`;
          return range;
        }

        const displayStart = progressView === "week" ? range.start : startOfWeek(range.start);
        const displayEnd = progressView === "week" ? range.end : addDays(startOfWeek(range.end), 6);
        const days = datesBetween(displayStart, displayEnd).map(date => renderCalendarDay(date, progressView === "month" && date.getMonth() !== progressAnchor.getMonth())).join("");
        $("#calendarView").innerHTML = '<div class="calendar-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-grid">' + days + "</div>";
        return range;
      }

      function histogramGroups(range) {
        if (progressView === "day") {
          const key = localDate(range.start);
          return activities.map(item => ({ label: item.short, title: item.name, values: { [item.id]: activityMinutesForDate(key, item.id) } }));
        }
        if (progressView === "year") {
          return Array.from({ length: 12 }, (_, month) => {
            const values = Object.fromEntries(activities.map(item => [item.id, 0]));
            const monthStart = new Date(progressAnchor.getFullYear(), month, 1, 12);
            const monthEnd = new Date(progressAnchor.getFullYear(), month + 1, 0, 12);
            datesBetween(monthStart, monthEnd).forEach(day => {
              const key = localDate(day);
              const date = parseDate(key);
              if (date.getFullYear() !== progressAnchor.getFullYear() || date.getMonth() !== month) return;
              activities.forEach(item => values[item.id] += activityMinutesForDate(key, item.id));
            });
            const date = new Date(progressAnchor.getFullYear(), month, 1, 12);
            return { label: date.toLocaleDateString("en-US", { month: "short" }), title: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }), values };
          });
        }
        return datesBetween(range.start, range.end).map(date => {
          const key = localDate(date);
          const values = Object.fromEntries(activities.map(item => [item.id, activityMinutesForDate(key, item.id)]));
          return { label: progressView === "week" ? date.toLocaleDateString("en-US", { weekday: "short" }) : String(date.getDate()), title: date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), values };
        });
      }

      function renderProgressAnalytics(range) {
        const startKey = localDate(range.start);
        const endKey = localDate(range.end);
        const entries = datesBetween(range.start, range.end).map(date => state.entries[localDate(date)]).filter(Boolean);
        const writingRecords = Object.values(state.writings).filter(record => record.date >= startKey && record.date <= endKey && record.draft);
        const sessionRecords = state.sessions.filter(record => record.date >= startKey && record.date <= endKey);
        const practicedDateKeys = new Set(entries.filter(entry => entry.status !== "rest").map(entry => entry.date).filter(Boolean));
        datesBetween(range.start, range.end).forEach(date => {
          const key = localDate(date);
          if (state.entries[key]?.status !== "rest" && state.entries[key]) practicedDateKeys.add(key);
          if (state.writings[key]?.draft) practicedDateKeys.add(key);
          if (sessionsOnDate(key).length) practicedDateKeys.add(key);
        });
        const practicedDays = practicedDateKeys.size;
        const minutes = datesBetween(range.start, range.end).reduce((sum, date) => sum + effectiveMinutesForDate(localDate(date)), 0);
        const sessions = sessionRecords.length;
        const wordsWritten = writingRecords.reduce((sum, record) => sum + writingWordCount(record.draft) + writingWordCount(record.rewrite), 0);
        const additions = state.library.filter(item => {
          const value = item.createdAt || item.updatedAt;
          if (!value) return false;
          const created = new Date(value);
          if (Number.isNaN(created.getTime())) return false;
          const key = localDate(created);
          return key >= startKey && key <= endKey;
        });
        const typeCounts = Object.fromEntries(Object.keys(libraryTypeColors).map(type => [type, additions.filter(item => item.type === type).length]));
        const summary = [
          ["Days practiced", practicedDays], ["Total minutes", minutes], ["Detailed sessions", sessions],
          ["Listening logs", sessionRecords.filter(record => record.type === "listening").length], ["Reading logs", sessionRecords.filter(record => record.type === "reading").length],
          ["Shadowing logs", sessionRecords.filter(record => record.type === "shadowing").length], ["Speaking logs", sessionRecords.filter(record => record.type === "speaking").length],
          ["Writing drafts", writingRecords.length], ["Words written", wordsWritten],
          ["Collocations added", typeCounts.collocation], ["Phrasal verbs added", typeCounts.phrasal_verb],
          ["Grammar added", typeCounts.grammar], ["Vocabulary added", typeCounts.vocabulary]
        ];
        $("#analyticsSummary").innerHTML = summary.map(([label, value]) => `<div class="analytics-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");

        const groups = histogramGroups(range).map(group => ({ ...group, total: Object.values(group.values).reduce((sum, value) => sum + value, 0) }));
        const max = Math.max(1, ...groups.map(group => group.total));
        $("#practiceHistogram").innerHTML = groups.map(group => {
          const height = group.total ? Math.max(5, Math.round((group.total / max) * 135)) : 2;
          const segments = activities.filter(item => group.values[item.id] > 0).map(item => `<i class="hist-segment" style="--activity-color:${activityColors[item.id]};height:${(group.values[item.id] / group.total) * 100}%" title="${escapeHtml(item.name)}: ${group.values[item.id]} minutes"></i>`).join("");
          return `<div class="hist-column" title="${escapeHtml(group.title)}: ${group.total} minutes"><span class="hist-value">${group.total || ""}</span><span class="hist-stack" style="height:${height}px">${segments}</span><span class="hist-label">${escapeHtml(group.label)}</span></div>`;
        }).join("");
        $("#histogramHelp").textContent = `Selected period: ${range.label}. Each color represents a different practice activity.`;

        const typeMax = Math.max(1, ...Object.values(typeCounts));
        $("#libraryHistogram").innerHTML = Object.entries(typeCounts).map(([type, count]) => `<div class="addition-row"><span>${libraryTypePlurals[type]}</span><span class="addition-track"><i class="addition-fill" style="--type-color:${libraryTypeColors[type]};width:${Math.round((count / typeMax) * 100)}%"></i></span><strong>${count}</strong></div>`).join("");
      }

      function renderProgress() {
        const week = getWindow(7);
        const practiced = week.filter(({ date, entry }) => (entry && entry.status !== "rest") || state.writings[date]?.draft || sessionsOnDate(date).length);
        const minutes = week.reduce((sum, { date }) => sum + effectiveMinutesForDate(date), 0);
        $("#metricDays").textContent = practiced.length;
        $("#metricMinutes").textContent = minutes;
        $("#metricChunks").textContent = state.library.length;
        const streak = returnStreak();
        $("#metricStreak").textContent = `${streak} day${streak === 1 ? "" : "s"}`;

        const range = renderCalendar();
        renderProgressAnalytics(range);
        const selectedDays = datesBetween(range.start, range.end).map(date => ({ date: localDate(date), entry: state.entries[localDate(date)] || null }));
        $("#coverageTitle").textContent = `Activity days · ${range.label}`;
        $("#coverage").innerHTML = activities.map(item => {
          const count = selectedDays.filter(({ date, entry }) => (entry && Object.prototype.hasOwnProperty.call(entry.activities || {}, item.id)) || sessionsOnDate(date).some(record => record.type === item.id) || (item.id === "writing" && state.writings[date]?.draft)).length;
          const width = Math.round((count / Math.max(1, selectedDays.length)) * 100);
          return `<div class="coverage-row"><span>${item.short}</span><span class="bar"><i style="width:${width}%;background:${activityColors[item.id]}"></i></span><strong>${count}</strong></div>`;
        }).join("");

        const recentDates = [...new Set([...Object.keys(state.entries), ...Object.keys(state.writings), ...state.sessions.map(record => record.date)])].sort((a, b) => b.localeCompare(a)).slice(0, 14);
        if (!recentDates.length) {
          $("#historyWrap").innerHTML = '<div class="empty">Your saved days will appear here.</div>';
          return;
        }
        const rows = recentDates.map(date => {
          const entry = state.entries[date];
          const detailedSessions = sessionsOnDate(date);
          const activityIds = new Set([...(entry ? Object.keys(entry.activities || {}) : []), ...detailedSessions.map(record => record.type), ...(state.writings[date]?.draft ? ["writing"] : [])]);
          const names = activities.filter(a => activityIds.has(a.id)).map(a => `<span class="tag">${a.short}</span>`).join("");
          const focus = entry?.question || entry?.correction || entry?.phrases?.[0] || detailedSessions[0]?.evidence || detailedSessions[0]?.source || entry?.notes || state.writings[date]?.prompt || "—";
          const status = entry?.status === "rest" && !detailedSessions.length && !state.writings[date]?.draft ? "rest" : entry?.status || "practiced";
          return `<tr><td><strong>${formatDate(date)}</strong><br><span class="tag ${status === "rest" ? "rest" : ""}">${status === "rest" ? "Rest" : status === "light" ? "Light" : "Practice"}</span></td><td>${effectiveMinutesForDate(date)} min</td><td>${names || "—"}</td><td>${escapeHtml(focus)}</td></tr>`;
        }).join("");
        $("#historyWrap").innerHTML = `<table class="history"><thead><tr><th>Day</th><th>Time</th><th>Activities</th><th>Main note / question</th></tr></thead><tbody>${rows}</tbody></table>`;
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);
      }

      function makeId() {
        return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      function typeLabel(type) {
        return ({ collocation: "Collocation", phrasal_verb: "Phrasal verb", grammar: "Grammar", vocabulary: "Vocabulary" })[type] || "Item";
      }

      function resetLibraryForm() {
        $("#libraryForm").reset();
        $("#libraryEditId").value = "";
        $("#librarySaveBtn").textContent = "Add to library";
        $("#libraryCancelBtn").hidden = true;
      }

      function recoverableLibraryItems() {
        return (state.libraryArchive || [])
          .filter(record => record.status === "trashed" && record.item)
          .filter(record => {
            const active = state.library.find(item => item.id === record.id);
            return !active || recordTimestamp(record) >= recordTimestamp(active);
          })
          .sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
      }

      function renderLibraryTrash() {
        const trashed = recoverableLibraryItems();
        $("#libraryTrashCount").textContent = String(trashed.length);
        $("#libraryTrashList").innerHTML = trashed.length ? trashed.map(record => `
          <div class="trash-item" data-trash-id="${escapeHtml(record.id)}">
            <div><strong>${escapeHtml(record.item.front || "Untitled item")}</strong><small>${typeLabel(record.item.type)} · moved ${new Date(record.updatedAt || record.deletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div>
            <button class="icon-btn" type="button" data-trash-action="restore">Restore</button>
          </div>
        `).join("") : '<div class="empty">Nothing has been deleted.</div>';
      }

      function renderLibrary() {
        renderStudyOverview();
        window.fluencyTracker?.refreshSpelling?.();
        for (const id of [...selectedReviewIds]) {
          const item = state.library.find(value => value.id === id);
          if (!item || item.review) selectedReviewIds.delete(id);
        }
        const filter = $("#libraryFilter").value;
        const dateFilter = $("#libraryDateFilter").value;
        const query = $("#librarySearch").value.trim().toLowerCase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visible = state.library
          .filter(item => filter === "all" || item.type === filter)
          .filter(item => {
            if (dateFilter === "all") return true;
            const created = new Date(item.createdAt || item.updatedAt || 0);
            if (Number.isNaN(created.getTime())) return false;
            created.setHours(0, 0, 0, 0);
            if (dateFilter === "today") return created.getTime() === today.getTime();
            const daysAgo = (today.getTime() - created.getTime()) / 86400000;
            return daysAgo >= 0 && daysAgo < Number(dateFilter);
          })
          .filter(item => !query || [item.front, item.back, item.example, item.source, ...(item.tags || [])].join(" ").toLowerCase().includes(query))
          .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
        $("#libraryCount").textContent = `${state.library.length} item${state.library.length === 1 ? "" : "s"}`;
        renderLibraryTrash();
        if (!visible.length) {
          $("#libraryList").innerHTML = `<div class="empty">${state.library.length ? "No items match this filter." : "Save your first collocation, phrasal verb, grammar point, or useful word."}</div>`;
          renderReviewSelection();
          renderProgress();
          return;
        }
        $("#libraryList").innerHTML = visible.map(item => `
          <article class="library-card ${selectedReviewIds.has(item.id) ? "selected" : ""}" data-id="${escapeHtml(item.id)}" data-reviewable="${item.review ? "false" : "true"}">
            <div>
              <span class="type-tag ${escapeHtml(item.type)}">${typeLabel(item.type)}</span>
              <h3>${escapeHtml(item.front)}</h3>
              <p>${item.back ? escapeHtml(item.back) : "<em>Draft — add the meaning or rule before studying.</em>"}</p>
              ${item.example ? `<small>Example: ${escapeHtml(item.example)}</small>` : ""}
              ${item.source ? `<small>Source: ${escapeHtml(item.source)}</small>` : ""}
              <small class="date-stamp">Created ${new Date(item.createdAt || item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>
              ${item.front && item.back ? `<small class="date-stamp">Review: ${escapeHtml(learningScheduleLabel(item))}</small>` : ""}
              ${(item.tags || []).length ? `<small>${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</small>` : ""}
              ${item.review && !item.review.finalizedAt ? `<div class="review-result ${escapeHtml(item.review.verdict)}"><strong>${item.review.verdict === "correct" ? "Correct and natural" : item.review.verdict === "minor" ? "Minor correction applied" : "Major correction applied"}</strong>${escapeHtml(item.review.explanation || "")}${item.review.originalExample && item.review.originalExample !== item.example ? `<small>Original: “${escapeHtml(item.review.originalExample)}”</small>` : ""}<button class="icon-btn finalize-btn" type="button" data-action="finalize">Accept &amp; finalize</button></div>` : ""}
            </div>
            <div class="library-actions">
              ${item.review ? `<span class="review-check">Reviewed</span><button class="icon-btn" type="button" disabled>Checked ✓</button>` : `<label class="review-check"><input type="checkbox" data-review-select="${escapeHtml(item.id)}" ${selectedReviewIds.has(item.id) ? "checked" : ""} /> Review</label><button class="icon-btn" type="button" data-action="review">Check</button>`}
              <button class="icon-btn" type="button" data-action="edit">Edit</button>
              <button class="icon-btn" type="button" data-action="delete">Move to trash</button>
            </div>
          </article>
        `).join("");
        renderReviewSelection();
        renderProgress();
      }

      async function saveLibraryItem(event) {
        event.preventDefault();
        const front = $("#libraryFront").value.trim();
        const back = $("#libraryBack").value.trim();
        if (!front || !back) return;
        const editId = $("#libraryEditId").value;
        const previous = state.library.find(item => item.id === editId);
        const nextExample = $("#libraryExample").value.trim();
        const exampleUnchanged = previous?.example === nextExample;
        const enteredTags = $("#libraryTags").value.split(",").map(tag => tag.trim()).filter(Boolean);
        const item = {
          id: editId || makeId(),
          type: $("#libraryType").value,
          front,
          back,
          example: nextExample,
          source: $("#librarySource").value.trim(),
          tags: exampleUnchanged ? enteredTags : enteredTags.filter(tag => !["ai-reviewed", "finalized"].includes(tag.toLowerCase())),
          review: exampleUnchanged ? previous.review : null,
          createdAt: previous?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (editId) state.library = state.library.map(existing => existing.id === editId ? item : existing);
        else state.library.push(item);
        saveState(state);
        resetLibraryForm();
        renderLibrary();
        $("#librarySaveState").textContent = editId ? "Item updated." : "Item added.";
        if (event.submitter?.value === "review") await copyReviewPrompt([item.id]);
        setTimeout(() => $("#librarySaveState").textContent = "", 2300);
      }

      function editLibraryItem(id) {
        const item = state.library.find(value => value.id === id);
        if (!item) return;
        $("#libraryEditId").value = item.id;
        $("#libraryType").value = item.type;
        $("#libraryFront").value = item.front;
        $("#libraryBack").value = item.back;
        $("#libraryExample").value = item.example || "";
        $("#librarySource").value = item.source || "";
        $("#libraryTags").value = (item.tags || []).join(", ");
        $("#librarySaveBtn").textContent = "Save changes";
        $("#libraryCancelBtn").hidden = false;
        $("#libraryFront").focus();
        openTrackerTab("library", { updateHash: true, scroll: true });
      }

      function deleteLibraryItem(id) {
        const item = state.library.find(value => value.id === id);
        if (!item || !confirm(`Move “${item.front}” to Trash? You can restore it later on any synced device.`)) return;
        const now = new Date().toISOString();
        const archived = { id, status: "trashed", item: structuredClone(item), deletedAt: now, updatedAt: now };
        state.libraryArchive = mergeRecordLists([archived], state.libraryArchive || []);
        state.library = state.library.filter(value => value.id !== id);
        selectedReviewIds.delete(id);
        saveState(state);
        renderLibrary();
        showToast(`Moved “${item.front}” to Trash. It remains recoverable and sync-safe.`);
      }

      function restoreLibraryItem(id) {
        const archived = (state.libraryArchive || []).find(record => record.id === id && record.item);
        if (!archived) return;
        const now = new Date().toISOString();
        const restored = { ...structuredClone(archived.item), updatedAt: now };
        state.library = mergeRecordLists([restored], state.library);
        state.libraryArchive = (state.libraryArchive || []).map(record => record.id === id ? { ...record, status: "restored", restoredAt: now, updatedAt: now, item: restored } : record);
        saveState(state);
        renderLibrary();
        showToast(`Restored “${restored.front}” to your learning library.`);
      }

      function finalizeReview(id) {
        const item = state.library.find(value => value.id === id);
        if (!item?.review) return;
        item.review.finalizedAt = new Date().toISOString();
        item.tags = [...new Set([...(item.tags || []).filter(tag => tag !== "mistake"), "finalized"])];
        item.updatedAt = new Date().toISOString();
        selectedReviewIds.delete(id);
        saveState(state);
        renderLibrary();
        showToast("Correction accepted. The review panel is hidden, and any reusable mistake card stays in your library.");
      }

      function renderReviewSelection() {
        const count = selectedReviewIds.size;
        $("#reviewSelectionCount").textContent = `${count} selected`;
        $("#copyReviewBtn").disabled = count === 0;
      }

      let toastTimer;
      function showToast(message, tone = "success") {
        const toast = $("#toast");
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.className = `toast ${tone === "error" ? "error" : ""} show`;
        toastTimer = setTimeout(() => toast.className = "toast", 5200);
      }

      function hasTrackerContent(value) {
        if (!value) return false;
        return Boolean(Object.keys(value.entries || {}).length || (value.library || []).length || Object.keys(value.writings || {}).length || (value.sessions || []).length || (value.practiceSessions || []).length || (value.spellingItems || []).length);
      }

      function activateStorage(userId) {
        const keys = storageKeysFor(userId);
        STORAGE_KEY = keys.state;
        DAILY_DRAFTS_KEY = keys.drafts;
        state = loadState();
      }

      function announceAccount() {
        window.dispatchEvent(new CustomEvent("fluency-account-changed", { detail: { user: accountUser, config: serverConfig, syncConnected } }));
      }

      function setSyncStatus(kind, message) {
        const button = $("#openSyncBtn");
        button.classList.toggle("connected", kind === "connected");
        button.classList.toggle("error", kind === "error");
        const signedOutLabel = serverConfig.googleSignIn || serverConfig.devLogin ? "Sign in" : "Device only";
        $("#syncButtonLabel").textContent = kind === "connected" ? "Synced" : kind === "saving" ? "Syncing…" : kind === "error" ? "Sync needs attention" : accountUser ? "Signed in" : signedOutLabel;
        $("#syncStatus").textContent = message;
      }

      async function syncRequest(method, body) {
        const response = await fetch("/api/sync", {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json", ...(accountUser ? { "X-Expected-User": accountUser.id } : {}) },
          body: body ? JSON.stringify(body) : undefined
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          handleSessionEnded();
          throw new Error("Your sign-in has expired. Sign in again to keep syncing.");
        }
        if (response.status === 412) {
          handleAccountChangedElsewhere("A different account is now signed in on this browser.");
          throw new Error("A different account is now signed in on this browser.");
        }
        if (!response.ok && response.status !== 409) throw new Error(payload.error || "Cloud sync failed.");
        return { response, payload };
      }

      function refreshAfterCloudMerge() {
        const date = $("#entryDate").value || localDate();
        setForm(dailyDraftFor(date) || state.entries[date] || null);
        const writingDate = $("#writingDate").value || localDate();
        setWritingForm(state.writings[writingDate] || null, writingDate);
        renderVariety();
        renderWritingHistory();
        renderSessionHistory();
        renderLibrary();
        renderProgress();
        renderProjectHandoff();
        renderStudyOverview();
        window.dispatchEvent(new CustomEvent("fluency-state-updated"));
      }

      async function waitForSyncIdle(timeoutMs = 8000) {
        const started = Date.now();
        while (syncBusy && Date.now() - started < timeoutMs) await new Promise(resolve => setTimeout(resolve, 100));
      }

      async function pushCloudState(retry = true) {
        if (!syncConnected) return;
        if (syncBusy) {
          pendingPush = true;
          return;
        }
        pendingPush = false;
        syncBusy = true;
        const epoch = accountEpoch;
        setSyncStatus("saving", "Saving your newest progress to the cloud…");
        try {
          const { response, payload } = await syncRequest("PUT", { state, baseRevision: syncRevision });
          if (epoch !== accountEpoch) return;
          if (response.status === 409 && retry) {
            state = mergeTrackerStates(state, payload.state || emptyState());
            syncRevision = Number(payload.revision) || 0;
            saveState(state, { skipSync: true });
            refreshAfterCloudMerge();
            syncBusy = false;
            return pushCloudState(false);
          }
          if (!response.ok) throw new Error(payload.error || "Cloud sync failed.");
          syncRevision = Number(payload.revision) || syncRevision;
          lastPushOk = !pendingPush;
          setSyncStatus("connected", `Synced ${new Date(payload.updatedAt || Date.now()).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`);
        } catch (error) {
          if (epoch !== accountEpoch) return;
          lastPushOk = false;
          if (accountUser) setSyncStatus("error", `${error instanceof Error ? error.message : "Cloud sync failed."} Your copy in this browser is safe.`);
        } finally {
          if (epoch === accountEpoch) syncBusy = false;
          if (epoch === accountEpoch && pendingPush && syncConnected) {
            clearTimeout(syncSaveTimer);
            syncSaveTimer = setTimeout(() => pushCloudState(), 250);
          }
        }
      }

      function scheduleCloudSave() {
        if (!syncConnected) return;
        lastPushOk = false;
        clearTimeout(syncSaveTimer);
        syncSaveTimer = setTimeout(() => pushCloudState(), 1100);
      }

      async function connectCloudSync(options = {}) {
        if (syncBusy || !accountUser) return;
        syncBusy = true;
        const epoch = accountEpoch;
        setSyncStatus("saving", "Connecting and safely merging this device with your cloud copy…");
        try {
          const { payload } = await syncRequest("GET");
          if (epoch !== accountEpoch) return;
          lastCloudPullAt = Date.now();
          const cloudState = normalizeStateShape(structuredClone(payload.state || emptyState()));
          state = mergeTrackerStates(state, payload.state || emptyState());
          state = migrateStoredState(normalizeStateShape(state));
          const cloudNeedsUpdate = JSON.stringify(state) !== JSON.stringify(cloudState);
          syncRevision = Number(payload.revision) || 0;
          syncConnected = true;
          saveState(state, { skipSync: true });
          refreshAfterCloudMerge();
          syncBusy = false;
          if (cloudNeedsUpdate) await pushCloudState();
          else {
            lastPushOk = true;
            setSyncStatus("connected", `Synced ${new Date(payload.updatedAt || Date.now()).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`);
          }
          if (!options.quiet) showToast("Cloud sync is on. Changes save automatically, and other devices refresh when you return to them.");
        } catch (error) {
          if (epoch !== accountEpoch) return;
          syncConnected = false;
          if (accountUser) setSyncStatus("error", `${error instanceof Error ? error.message : "Cloud sync failed."} Your copy in this browser is safe.`);
          syncBusy = false;
        }
        if (epoch === accountEpoch) announceAccount();
      }

      async function syncNow(options = {}) {
        if (!syncConnected) {
          if (accountUser) await connectCloudSync(options);
          return;
        }
        if (syncBusy) return;
        syncBusy = true;
        const epoch = accountEpoch;
        setSyncStatus("saving", "Checking your other devices for newer progress…");
        try {
          const { payload } = await syncRequest("GET");
          if (epoch !== accountEpoch) return;
          lastCloudPullAt = Date.now();
          const cloudState = normalizeStateShape(structuredClone(payload.state || emptyState()));
          state = mergeTrackerStates(state, payload.state || emptyState());
          const cloudNeedsUpdate = JSON.stringify(state) !== JSON.stringify(cloudState);
          syncRevision = Number(payload.revision) || 0;
          saveState(state, { skipSync: true });
          refreshAfterCloudMerge();
          syncBusy = false;
          if (cloudNeedsUpdate) await pushCloudState();
          else setSyncStatus("connected", `Checked ${new Date(payload.updatedAt || Date.now()).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`);
          if (!options.quiet) showToast("Everything is up to date across your devices.");
        } catch (error) {
          if (epoch !== accountEpoch) return;
          syncBusy = false;
          if (accountUser) setSyncStatus("error", `${error instanceof Error ? error.message : "Cloud sync failed."} Your copy in this browser is safe.`);
        }
      }

      // One-time offer to move progress saved without an account into the account.
      function offerDeviceMerge(user) {
        const declinedKey = `english-fluency-device-merge-declined:${user.id}`;
        if (readStorage(declinedKey)) return;
        let deviceState = null;
        try { deviceState = normalizeStateShape(JSON.parse(readStorage(DEVICE_STORAGE_KEY))); } catch { deviceState = null; }
        if (!hasTrackerContent(deviceState)) return;
        if (confirm(`This browser has progress saved without an account.\n\nAdd it to ${user.email}? Nothing is deleted; matching records keep the newest copy.`)) {
          state = mergeTrackerStates(state, deviceState);
          saveState(state, { skipSync: true });
          localStorage.removeItem(DEVICE_STORAGE_KEY);
          showToast("This browser’s progress was added to your account.");
        } else {
          localStorage.setItem(declinedKey, "1");
        }
      }

      async function handleSignedIn(user) {
        const switching = accountUser?.id !== user.id || STORAGE_KEY !== storageKeysFor(user.id).state;
        if (switching) {
          accountEpoch += 1;
          syncBusy = false;
          syncConnected = false;
          clearTimeout(syncSaveTimer);
        }
        accountUser = user;
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, user.id);
        if (switching) activateStorage(user.id);
        offerDeviceMerge(user);
        refreshAfterCloudMerge();
        announceAccount();
        await connectCloudSync({ quiet: true });
      }

      function showDeviceOnly(message, options = {}) {
        accountEpoch += 1;
        syncBusy = false;
        clearTimeout(syncSaveTimer);
        accountUser = null;
        syncConnected = false;
        syncRevision = 0;
        lastCloudPullAt = 0;
        pendingPush = false;
        if (!options.keepMarker) localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        if (STORAGE_KEY !== DEVICE_STORAGE_KEY) {
          activateStorage(null);
          refreshAfterCloudMerge();
        }
        setSyncStatus("disconnected", message);
        announceAccount();
      }

      // Another tab signed out or switched accounts. Stop showing (and syncing) this
      // account immediately, then load whichever account is signed in now.
      let accountRecheck = null;
      function handleAccountChangedElsewhere(message) {
        if (accountUser) showDeviceOnly(message, { keepMarker: true });
        if (!accountRecheck) accountRecheck = initAccount().finally(() => { accountRecheck = null; });
        return accountRecheck;
      }
      window.addEventListener("storage", event => {
        if (event.key !== ACTIVE_ACCOUNT_KEY && event.key !== null) return;
        const signedInHere = accountUser?.id || "";
        const signedInNow = readStorage(ACTIVE_ACCOUNT_KEY) || "";
        if (signedInHere === signedInNow) return;
        handleAccountChangedElsewhere(signedInNow ? "Another tab switched accounts. Loading that account…" : "You signed out in another tab.");
      });

      // The session expired: keep the account cache (it syncs again after the next
      // sign-in) but stop showing it.
      function handleSessionEnded() {
        if (!accountUser) return;
        showDeviceOnly("Your sign-in expired. Sign in again to see and sync your account’s progress.");
      }

      async function signOut() {
        if (!accountUser) return;
        clearTimeout(syncSaveTimer);
        await waitForSyncIdle();
        if (syncConnected) await pushCloudState();
        if (!lastPushOk && !confirm("Some changes have not reached the cloud yet. Sign out anyway and remove them from this browser?")) return;
        const keys = storageKeysFor(accountUser.id);
        await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
        localStorage.removeItem(keys.state);
        localStorage.removeItem(keys.drafts);
        showDeviceOnly("Signed out. This browser now shows progress saved without an account.");
        showToast("Signed out. Your account’s progress was removed from this browser and stays safe in the cloud.");
      }

      async function deleteAccount() {
        if (!accountUser) return false;
        const email = accountUser.email;
        const answer = prompt(`This permanently deletes the account ${email}, its synced progress, and its saved AI connections.\n\nType DELETE to confirm.`);
        if (answer !== "DELETE") return false;
        clearTimeout(syncSaveTimer);
        await waitForSyncIdle();
        const response = await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast(payload.error || "The account could not be deleted. Please try again.", "error");
          return false;
        }
        const keys = storageKeysFor(accountUser.id);
        localStorage.removeItem(keys.state);
        localStorage.removeItem(keys.drafts);
        localStorage.removeItem(`english-fluency-device-merge-declined:${accountUser.id}`);
        showDeviceOnly("Account deleted. This browser now shows progress saved without an account.");
        showToast("Your account and its synced data were deleted.");
        return true;
      }

      async function initAccount() {
        try {
          const response = await fetch("/api/me", { headers: { Accept: "application/json" } });
          const payload = await response.json();
          serverConfig = { ...serverConfig, ...(payload.config || {}) };
          if (payload.signedIn && payload.user) await handleSignedIn(payload.user);
          else showDeviceOnly("Not signed in. Your progress is saved in this browser.");
        } catch {
          if (rememberedAccountId) setSyncStatus("error", "Offline. Showing the progress saved in this browser; it will sync when you are back online.");
          else setSyncStatus("disconnected", "Offline. Your progress is saved in this browser.");
          announceAccount();
        }
      }

      async function copyText(text) {
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            return;
          } catch {}
        }
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("Clipboard access was blocked.");
      }

      function makeReviewPrompt(items) {
        const payload = items.map(item => ({
          id: item.id,
          type: item.type,
          expression_or_rule: item.front,
          meaning_or_rule: item.back,
          learner_example: item.example || ""
        }));
        return `Please review these English learning-library examples for a learner who wants natural ${englishVariety()}. ${learnerLine()}

For each item:
1. Judge the learner example as "correct", "minor", or "major".
2. Give a corrected_example. If it is already natural, repeat it unchanged.
3. Give a concise explanation focused on grammar, collocation, phrasal-verb usage, register, or naturalness.
4. Add new_items only when the mistake teaches a genuinely reusable grammar rule, collocation, phrasal verb, or vocabulary distinction. Add at most two per reviewed item and avoid duplicating the original item.

Return ONLY valid JSON with this exact shape—no Markdown or commentary outside the JSON:
{
  "review_version": 1,
  "reviews": [
    {
      "id": "copy the exact item id",
      "verdict": "correct|minor|major",
      "corrected_example": "natural corrected sentence",
      "explanation": "brief learner-friendly explanation",
      "new_items": [
        {
          "type": "grammar|collocation|phrasal_verb|vocabulary",
          "front": "reusable point",
          "back": "clear meaning or rule",
          "example": "natural example"
        }
      ]
    }
  ]
}

Items to review:
${JSON.stringify(payload, null, 2)}`;
      }

      async function copyReviewPrompt(ids = [...selectedReviewIds], trigger = null) {
        const wanted = new Set(ids);
        const items = state.library.filter(item => wanted.has(item.id));
        if (!items.length) {
          $("#reviewApplyState").textContent = "Select at least one library item.";
          showToast("Select at least one library item first.", "error");
          return;
        }
        const originalLabel = trigger?.textContent;
        try {
          await copyText(makeReviewPrompt(items));
          if (trigger) {
            trigger.textContent = "Copied ✓";
            trigger.disabled = true;
            setTimeout(() => {
              trigger.textContent = originalLabel;
              trigger.disabled = false;
            }, 2200);
          }
          const message = `Copied ${items.length} item${items.length === 1 ? "" : "s"}. Paste it into your AI chat, then paste the JSON reply below.`;
          $("#reviewApplyState").textContent = message;
          showToast(message);
          setTimeout(() => $("#reviewApplyState").textContent = "", 5200);
        } catch {
          const message = "Your browser blocked copying. Allow clipboard access, then click Check again.";
          $("#reviewApplyState").textContent = message;
          showToast(message, "error");
        }
      }

      function parseReviewPackage(raw) {
        const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("I could not find the JSON review package.");
        const payload = JSON.parse(text.slice(start, end + 1));
        if (payload.review_version !== 1 || !Array.isArray(payload.reviews)) throw new Error("This is not a compatible review package.");
        return payload;
      }

      function applyReviewPayload(payload) {
        const verdicts = new Set(["correct", "minor", "major"]);
        const types = new Set(["collocation", "phrasal_verb", "grammar", "vocabulary"]);
        let updated = 0;
        let created = 0;
        for (const review of payload.reviews) {
          if (!review || !verdicts.has(review.verdict)) continue;
          const item = state.library.find(value => value.id === review.id);
          if (!item) continue;
          const originalExample = item.example || "";
          const corrected = String(review.corrected_example || "").trim();
          if (corrected) item.example = corrected;
          item.review = {
            verdict: review.verdict,
            explanation: String(review.explanation || "").trim(),
            originalExample,
            reviewedAt: new Date().toISOString()
          };
          item.tags = [...new Set([...(item.tags || []), "AI-reviewed", ...(review.verdict === "correct" ? [] : ["mistake"])])];
          item.updatedAt = new Date().toISOString();
          recordLearningOutcome(item.id, review.verdict === "correct" ? "right" : "again", "example review");
          updated++;
          const additions = Array.isArray(review.new_items) ? review.new_items.slice(0, 2) : [];
          for (const addition of additions) {
            if (!addition || !types.has(addition.type)) continue;
            const front = String(addition.front || "").trim();
            const back = String(addition.back || "").trim();
            if (!front || !back) continue;
            if (state.library.some(value => value.type === addition.type && value.front.toLowerCase() === front.toLowerCase())) continue;
            const newItem = {
              id: makeId(), type: addition.type, front, back,
              example: String(addition.example || "").trim(),
              source: `Created from review of “${item.front}”`,
              tags: ["mistake", "AI-created"],
              review: null,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            state.library.push(newItem);
            recordLearningOutcome(newItem.id, "again", "example mistake");
            created++;
          }
        }
        if (!updated) throw new Error("None of the reviewed item IDs matched your current library.");
        saveState(state);
        selectedReviewIds.clear();
        renderLibrary();
        return { updated, created };
      }

      function applyPastedReview() {
        try {
          const payload = parseReviewPackage($("#reviewPackageInput").value);
          const result = applyReviewPayload(payload);
          $("#reviewPackageInput").value = "";
          $("#reviewApplyState").textContent = `Applied ${result.updated} review${result.updated === 1 ? "" : "s"} and created ${result.created} new learning item${result.created === 1 ? "" : "s"}.`;
        } catch (error) {
          $("#reviewApplyState").textContent = error instanceof Error ? error.message : "The review package could not be applied.";
        }
      }

      function savePhrasesToLibrary() {
        const phrases = $$(".phrase").map(input => input.value.trim()).filter(Boolean);
        if (!phrases.length) {
          $("#saveState").textContent = "Add a phrase first.";
          return;
        }
        let added = 0;
        for (const phrase of phrases) {
          if (state.library.some(item => item.front.toLowerCase() === phrase.toLowerCase())) continue;
          state.library.push({
            id: makeId(), type: "collocation", front: phrase, back: "", example: "", source: "Daily check-in", tags: ["draft"],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
          });
          added++;
        }
        saveState(state);
        renderLibrary();
        $("#saveState").textContent = added ? `Added ${added} phrase${added === 1 ? "" : "s"} as library draft${added === 1 ? "" : "s"}.` : "Those phrases are already in your library.";
        if (added) openTrackerTab("library", { updateHash: true, scroll: true });
      }

      function normalizedLearningReview(id) {
        const current = state.reviews[id] || {};
        return {
          ...current,
          right: Number(current.right) || 0,
          again: Number(current.again) || 0,
          streak: Number(current.streak) || 0,
          lapses: Number(current.lapses) || 0,
          intervalDays: Number(current.intervalDays) || 0,
          history: Array.isArray(current.history) ? current.history : []
        };
      }

      function isLearningItemDue(item, at = new Date()) {
        const review = state.reviews[item.id];
        if (!review?.last || !review.dueAt) return true;
        const due = new Date(review.dueAt);
        return Number.isNaN(due.getTime()) || due <= at;
      }

      function learningScheduleLabel(item) {
        const review = state.reviews[item.id];
        if (!review?.last) return "New · due now";
        if (isLearningItemDue(item)) return review.lastResult === "again" ? "Needs another try · due now" : "Due now";
        return `Next review ${new Date(review.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }

      function recordLearningOutcome(id, result, source = "flashcard") {
        const item = state.library.find(value => value.id === id);
        if (!item || !["right", "again"].includes(result)) return null;
        const now = new Date();
        const review = normalizedLearningReview(id);
        review[result] += 1;
        review.last = now.toISOString();
        review.updatedAt = review.last;
        review.lastResult = result;
        review.lastSource = source;
        if (result === "again") {
          review.streak = 0;
          review.intervalDays = 0;
          review.lapses += 1;
          review.dueAt = now.toISOString();
        } else {
          review.streak += 1;
          const intervals = [2, 5, 10, 21, 45, 90, 180];
          const indexed = intervals[review.streak - 1];
          review.intervalDays = indexed || Math.min(180, Math.max(1, Math.round((review.intervalDays || 60) * 1.8)));
          const due = new Date(now);
          due.setDate(due.getDate() + review.intervalDays);
          review.dueAt = due.toISOString();
        }
        review.history = [...review.history, { result, source, at: review.last }].slice(-40);
        state.reviews[id] = review;
        return review;
      }

      function smartStudyOrder(items) {
        const rank = item => {
          const review = state.reviews[item.id];
          const mistake = (item.tags || []).some(tag => /mistake/i.test(tag));
          const due = isLearningItemDue(item);
          const dueTime = review?.dueAt ? new Date(review.dueAt).getTime() || 0 : 0;
          return [due ? 0 : 1, review?.lastResult === "again" ? 0 : 1, review?.last ? 1 : 0, mistake ? 0 : 1, dueTime];
        };
        return [...items].sort((a, b) => {
          const left = rank(a);
          const right = rank(b);
          for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] - right[index];
          return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
        });
      }

      function completedItems(ignoreScope = false) {
        const filter = $("#studyFilter").value;
        const scope = ignoreScope ? "all" : $("#studyScope").value;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return state.library
          .filter(item => item.front && item.back && (filter === "all" || item.type === filter))
          .filter(item => {
            if (scope === "all") return true;
            if (scope === "due") return isLearningItemDue(item);
            const created = new Date(item.createdAt || item.updatedAt || 0);
            if (Number.isNaN(created.getTime())) return false;
            created.setHours(0, 0, 0, 0);
            if (scope === "today") return created.getTime() === today.getTime();
            const daysAgo = (today.getTime() - created.getTime()) / 86400000;
            return daysAgo >= 0 && daysAgo < 7;
          });
      }

      function renderStudyOverview() {
        const all = state.library.filter(item => item.front && item.back);
        const due = all.filter(item => isLearningItemDue(item)).length;
        const learning = all.filter(item => state.reviews[item.id]?.last && Number(state.reviews[item.id]?.intervalDays || 0) < 30).length;
        const strong = all.filter(item => Number(state.reviews[item.id]?.intervalDays || 0) >= 30).length;
        $("#studyOverview").innerHTML = `<div><strong>${due}</strong><small>due now</small></div><div><strong>${learning}</strong><small>learning</small></div><div><strong>${strong}</strong><small>30+ days</small></div>`;
      }

      function shuffled(values) {
        const copy = [...values];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      }

      function studyWordForms(word) {
        const base = String(word || "").toLowerCase();
        const irregular = {
          be: ["am", "is", "are", "was", "were", "been", "being"],
          bring: ["brings", "brought", "bringing"],
          buy: ["buys", "bought", "buying"],
          come: ["comes", "came", "coming"],
          do: ["does", "did", "done", "doing"],
          feel: ["feels", "felt", "feeling"],
          find: ["finds", "found", "finding"],
          get: ["gets", "got", "gotten", "getting"],
          go: ["goes", "went", "gone", "going"],
          have: ["has", "had", "having"],
          keep: ["keeps", "kept", "keeping"],
          leave: ["leaves", "left", "leaving"],
          make: ["makes", "made", "making"],
          run: ["runs", "ran", "running"],
          say: ["says", "said", "saying"],
          see: ["sees", "saw", "seen", "seeing"],
          speak: ["speaks", "spoke", "spoken", "speaking"],
          take: ["takes", "took", "taken", "taking"],
          tell: ["tells", "told", "telling"],
          think: ["thinks", "thought", "thinking"],
          write: ["writes", "wrote", "written", "writing"]
        };
        const forms = new Set([base, ...(irregular[base] || [])]);
        if (!irregular[base]) {
          forms.add(base.endsWith("s") || base.endsWith("x") || base.endsWith("ch") || base.endsWith("sh") ? `${base}es` : `${base}s`);
          if (/[^aeiou]y$/.test(base)) {
            forms.add(`${base.slice(0, -1)}ied`);
            forms.add(`${base.slice(0, -1)}ies`);
          } else if (base.endsWith("e")) {
            forms.add(`${base}d`);
          } else {
            forms.add(`${base}ed`);
          }
          forms.add(base.endsWith("e") && !base.endsWith("ee") ? `${base.slice(0, -1)}ing` : `${base}ing`);
        }
        return [...forms];
      }

      function studyExpressionForms(expression) {
        const target = String(expression || "").trim();
        if (!target) return [];
        const [first, ...rest] = target.split(/\s+/);
        const tail = rest.length ? ` ${rest.join(" ")}` : "";
        return [...new Set([target, ...studyWordForms(first).map(form => `${form}${tail}`)])]
          .sort((a, b) => b.length - a.length);
      }

      function maskExpression(sentence, expression) {
        const source = String(sentence || "");
        const lowerSource = source.toLowerCase();
        for (const candidate of studyExpressionForms(expression)) {
          let fromIndex = 0;
          while (fromIndex < lowerSource.length) {
            const index = lowerSource.indexOf(candidate.toLowerCase(), fromIndex);
            if (index < 0) break;
            const before = index > 0 ? lowerSource[index - 1] : "";
            const after = lowerSource[index + candidate.length] || "";
            if (!/[a-z0-9']/i.test(before) && !/[a-z0-9']/i.test(after)) {
              const answer = source.slice(index, index + candidate.length);
              return { prompt: `${source.slice(0, index)}_____${source.slice(index + candidate.length)}`, answer };
            }
            fromIndex = index + 1;
          }
        }
        return null;
      }

      function trustedStudyExample(item) {
        const example = String(item.example || "").trim();
        if (!example) return "";
        const tags = new Set((item.tags || []).map(tag => String(tag).toLowerCase()));
        return item.review?.reviewedAt || tags.has("ai-created") ? example : "";
      }

      function knownIncorrectExample(item) {
        if (!item.review || !["minor", "major"].includes(item.review.verdict)) return "";
        const original = String(item.review.originalExample || "").trim();
        const corrected = trustedStudyExample(item);
        return original && corrected && original !== corrected ? original : "";
      }

      function uniqueMeaningDistractors(item) {
        const seen = new Set([String(item.back || "").trim().toLowerCase()]);
        const candidates = [];
        for (const candidate of shuffled(studyOptionPool)) {
          if (candidate.id === item.id || candidate.type !== item.type) continue;
          const meaning = String(candidate.back || "").trim();
          const key = meaning.toLowerCase();
          if (!meaning || seen.has(key)) continue;
          seen.add(key);
          candidates.push(candidate);
          if (candidates.length === 3) break;
        }
        return candidates;
      }

      function productionChallenge(item) {
        const trustedExample = trustedStudyExample(item);
        const unreviewedExample = Boolean(String(item.example || "").trim() && !trustedExample);
        if (item.type === "grammar") {
          const incorrect = knownIncorrectExample(item);
          if (incorrect) return {
            instruction: "Correct your original sentence",
            lead: incorrect,
            placeholder: "Type the complete corrected sentence.",
            modelAnswer: trustedExample,
            explanation: item.back,
            example: trustedExample
          };
          return {
            instruction: "Apply the grammar",
            lead: `${item.front}: ${item.back}`,
            placeholder: "Write a new sentence that follows this rule.",
            modelAnswer: item.front,
            explanation: item.back,
            example: trustedExample,
            qualityNote: unreviewedExample ? "Your saved example is waiting for review, so it is not being shown as a model answer." : "Create your own example, then compare it with the rule before rating yourself."
          };
        }
        const masked = maskExpression(trustedExample, item.front);
        if (masked) return {
          instruction: "Complete the sentence",
          lead: masked.prompt,
          placeholder: `Type the missing ${item.type === "vocabulary" ? "word" : "expression"}.`,
          modelAnswer: masked.answer,
          explanation: item.back,
          example: trustedExample
        };
        return {
          instruction: "Use it naturally",
          lead: `${item.front}: ${item.back}`,
          placeholder: "Write one natural, personal sentence.",
          modelAnswer: item.front,
          explanation: item.back,
          example: trustedExample,
          qualityNote: unreviewedExample ? "Your saved example is waiting for review, so it is not being used as a quiz sentence." : "No reviewed example is available yet. Create a personal sentence and check that it matches the meaning."
        };
      }

      function quizChallenge(item) {
        const production = productionChallenge(item);
        if (item.type === "grammar" || production.instruction === "Complete the sentence") return { kind: "production", ...production };
        const distractors = uniqueMeaningDistractors(item);
        if (distractors.length === 3) {
          const options = shuffled([{ id: item.id, text: item.back, correct: true }, ...distractors.map(candidate => ({ id: candidate.id, text: candidate.back, correct: false }))]);
          return {
            kind: "choice",
            instruction: "Choose the saved meaning for this expression",
            lead: item.front,
            options,
            correctId: item.id,
            answer: item.back,
            example: trustedStudyExample(item),
            qualityNote: item.example && !trustedStudyExample(item) ? "The unchecked example is hidden until it has been reviewed." : ""
          };
        }
        return { kind: "production", ...production };
      }

      function startStudy(mode) {
        const available = smartStudyOrder(completedItems());
        studyOptionPool = smartStudyOrder(completedItems(true));
        if (!available.length) {
          const scope = $("#studyScope").value;
          $("#studySurface").innerHTML = `<div class="empty">${scope === "due" ? "Nothing is due right now. Choose cards from today, the last seven days, or all cards if you want extra practice." : "No completed cards match these filters."}</div>`;
          $("#studyStatus").textContent = scope === "due" ? "You are caught up." : "Try another card type or time range.";
          return;
        }
        studyMode = mode;
        studyItems = available;
        studyIndex = 0;
        studySessionStats = { initial: available.length, right: 0, again: 0 };
        pendingStudyResult = null;
        currentQuiz = null;
        studyStartedAt = Date.now();
        studyProgressLogged = false;
        renderStudyCard();
      }

      function studyStats() {
        $("#studyStatus").textContent = `${studyMode === "quiz" ? "Application quiz" : "Active recall"} · ${studyItems.length} remaining · ${studySessionStats.right} understood · ${studySessionStats.again} again`;
      }

      function renderProductionStudyCard(item, challenge = productionChallenge(item)) {
        currentQuiz = null;
        const modelAnswer = challenge.modelAnswer || item.front;
        const explanation = challenge.explanation || item.back;
        const example = challenge.example || "";
        $("#studySurface").innerHTML = `
          <div class="study-card" data-id="${escapeHtml(item.id)}">
            <div class="prompt" id="studyCardStatus">${escapeHtml(learningScheduleLabel(item))} · ${escapeHtml(challenge.instruction)} · ${typeLabel(item.type)}</div>
            <div class="study-task">${escapeHtml(challenge.lead)}</div>
            ${challenge.qualityNote ? `<div class="study-quality-note">${escapeHtml(challenge.qualityNote)}</div>` : ""}
            <label class="study-response"><span class="study-answer-label">Your answer</span><textarea id="studyProductionInput" placeholder="${escapeHtml(challenge.placeholder)}"></textarea></label>
            <div class="back"><span class="study-answer-label">Reference answer and explanation</span><strong class="study-answer-copy">${escapeHtml(modelAnswer)}</strong><span class="study-answer-copy">${escapeHtml(explanation)}</span>${example ? `<div class="study-example">“${escapeHtml(example)}”</div>` : ""}</div>
            <div class="action-row" style="justify-content:center">
              <button class="btn primary" type="button" data-study="reveal">Check my answer</button>
              <button class="btn" type="button" data-study="again" hidden>Again · keep in this session</button>
              <button class="btn" type="button" data-study="right" hidden>Understood · schedule later</button>
              <button class="btn primary" type="button" data-study="next" hidden>Next question</button>
            </div>
          </div>`;
      }

      function renderStudyCard() {
        const item = studyItems[studyIndex];
        if (!item) return;
        studyStats();
        if (studyMode === "quiz") {
          const challenge = quizChallenge(item);
          if (challenge.kind === "production") return renderProductionStudyCard(item, challenge);
          currentQuiz = challenge;
          $("#studySurface").innerHTML = `
            <div class="study-card" data-id="${escapeHtml(item.id)}">
              <div class="prompt" id="studyCardStatus">${escapeHtml(learningScheduleLabel(item))} · ${escapeHtml(challenge.instruction)} · ${typeLabel(item.type)}</div>
              <div class="study-task">${escapeHtml(challenge.lead)}</div>
              ${challenge.qualityNote ? `<div class="study-quality-note">${escapeHtml(challenge.qualityNote)}</div>` : ""}
              <div class="quiz-options">${challenge.options.map(option => `<button class="quiz-option" type="button" data-option="${escapeHtml(option.id)}">${escapeHtml(option.text)}</button>`).join("")}</div>
              <div class="back" id="quizFeedback"></div>
            </div>`;
        } else {
          renderProductionStudyCard(item);
        }
      }

      function recordReview(id, result) {
        const review = recordLearningOutcome(id, result, studyMode === "quiz" ? "quiz" : "flashcard");
        if (!review) return;
        const production = $("#studyProductionInput")?.value.trim();
        if (production) {
          review.lastProduction = production;
          review.lastProductionAt = new Date().toISOString();
        }
        saveState(state);
        renderStudyOverview();
      }

      function logStudyProgress() {
        if (studyProgressLogged || !studyStartedAt) return 0;
        const minutes = Math.max(1, Math.min(90, Math.round((Date.now() - studyStartedAt) / 60000) || 1));
        const date = localDate();
        const entry = state.entries[date] || { status: "practiced", activities: {}, phrases: [], question: "", correction: "", notes: "", updatedAt: new Date().toISOString() };
        entry.status = entry.status === "rest" ? "light" : (entry.status || "practiced");
        entry.activities = entry.activities || {};
        entry.activities.review = (Number(entry.activities.review) || 0) + minutes;
        entry.notes = [entry.notes, `Smart review: ${studyMode === "quiz" ? "application quiz" : "active recall"}, ${studySessionStats.right + studySessionStats.again} answers.`].filter(Boolean).join(" ");
        entry.updatedAt = new Date().toISOString();
        state.entries[date] = entry;
        studyProgressLogged = true;
        saveState(state);
        if ($("#entryDate").value === date) setForm(dailyDraftFor(date) || entry);
        renderProgress();
        return minutes;
      }

      function nextStudy(result = pendingStudyResult) {
        const item = studyItems[studyIndex];
        if (!item || !result) return;
        studyItems.splice(studyIndex, 1);
        if (result === "again") {
          const insertAt = Math.min(studyIndex + Math.min(2, studyItems.length), studyItems.length);
          studyItems.splice(insertAt, 0, item);
        }
        pendingStudyResult = null;
        if (!studyItems.length) {
          const minutes = logStudyProgress();
          $("#studySurface").innerHTML = `<div class="empty"><strong>Review complete.</strong><br>${studySessionStats.right} understood and scheduled for later; ${studySessionStats.again} “Again” answer${studySessionStats.again === 1 ? "" : "s"} reviewed until cleared.<br><br><strong>${minutes} review minute${minutes === 1 ? "" : "s"} logged automatically.</strong></div>`;
          $("#studyStatus").textContent = `Session complete · ${studySessionStats.right} understood · ${studySessionStats.again} again · ${minutes} min logged`;
          renderStudyOverview();
          return;
        }
        if (studyIndex >= studyItems.length) studyIndex = 0;
        renderStudyCard();
      }

      function submitStudyResult(result) {
        const item = studyItems[studyIndex];
        if (!item || pendingStudyResult) return;
        recordReview(item.id, result);
        studySessionStats[result] += 1;
        pendingStudyResult = result;
        const card = $("#studySurface .study-card");
        const status = $("#studyCardStatus");
        if (status) status.textContent = result === "right" ? `Understood · ${learningScheduleLabel(item)}` : "Needs another try · will repeat in this session";
        card?.querySelectorAll('[data-study="again"], [data-study="right"]').forEach(button => button.hidden = true);
        const next = card?.querySelector('[data-study="next"]');
        if (next) next.hidden = false;
        studyStats();
      }

      function savePersonalStudySentence() {
        const item = studyItems[studyIndex];
        const sentence = $("#studyPersonalSentence")?.value.trim();
        if (item && sentence) {
          const review = normalizedLearningReview(item.id);
          review.lastProduction = sentence;
          review.lastProductionAt = new Date().toISOString();
          review.updatedAt = review.lastProductionAt;
          state.reviews[item.id] = review;
          saveState(state);
        }
        nextStudy();
      }

      function answerQuiz(optionId) {
        const item = studyItems[studyIndex];
        if (!item || !currentQuiz || pendingStudyResult) return;
        const correct = optionId === currentQuiz.correctId;
        $$(".quiz-option").forEach(button => {
          button.disabled = true;
          if (button.dataset.option === currentQuiz.correctId) button.classList.add("correct");
          else if (button.dataset.option === optionId) button.classList.add("wrong");
        });
        pendingStudyResult = correct ? "right" : "again";
        recordReview(item.id, pendingStudyResult);
        studySessionStats[pendingStudyResult] += 1;
        const status = $("#studyCardStatus");
        if (status) status.textContent = correct ? `Correct · ${learningScheduleLabel(item)}` : "Not quite · will repeat in this session";
        const feedback = $("#quizFeedback");
        feedback.style.display = "block";
        feedback.innerHTML = `<strong>${correct ? "Correct." : "Not quite."}</strong><span class="study-answer-copy">${escapeHtml(currentQuiz.answer || item.back)}</span>${currentQuiz.example ? `<div class="study-example">“${escapeHtml(currentQuiz.example)}”</div>` : ""}<label class="study-personal"><span>Use it in one personal sentence (recommended)</span><textarea id="studyPersonalSentence" placeholder="Write your own example before moving on."></textarea></label><div class="action-row" style="justify-content:center"><button class="btn primary" type="button" data-study="save-next">Save sentence &amp; continue</button><button class="btn ghost" type="button" data-study="next">Skip sentence</button></div>`;
        studyStats();
      }

      function downloadFile(name, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function buildProjectHandoff(days = 30) {
        const selectedDays = Math.min(30, Math.max(7, Number(days) || 30));
        const recent = getWindow(selectedDays);
        const dateKeys = recent.map(item => item.date);
        const dateSet = new Set(dateKeys);
        const compact = value => String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
        const practiceDate = record => record.date || (record.startedAt ? localDate(new Date(record.startedAt)) : "");
        const practicedDates = new Set();
        const restDates = new Set();

        for (const { date, entry } of recent) {
          if (entry?.status === "rest") restDates.add(date);
          if (entry && entry.status !== "rest") practicedDates.add(date);
          if (state.writings[date]?.draft || sessionsOnDate(date).length) practicedDates.add(date);
        }
        for (const record of state.practiceSessions) {
          const date = practiceDate(record);
          if (dateSet.has(date)) practicedDates.add(date);
        }

        const activityTotals = Object.fromEntries(activities.map(activity => [activity.id, dateKeys.reduce((sum, date) => sum + activityMinutesForDate(date, activity.id), 0)]));
        const totalMinutesValue = Object.values(activityTotals).reduce((sum, value) => sum + value, 0);
        const recentLibrary = state.library.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 15);
        const recentSessions = state.sessions.slice().sort((a, b) => String(b.updatedAt || b.createdAt || b.date || "").localeCompare(String(a.updatedAt || a.createdAt || a.date || ""))).filter(record => dateSet.has(record.date)).slice(0, 8);
        const recentWritings = Object.values(state.writings).filter(record => dateSet.has(record.date) && record.draft).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
        const recentPractice = state.practiceSessions.slice().filter(record => dateSet.has(practiceDate(record))).sort((a, b) => String(b.finishedAt || b.updatedAt || b.startedAt || "").localeCompare(String(a.finishedAt || a.updatedAt || a.startedAt || ""))).slice(0, 6);
        const recentSpelling = (state.spellingItems || []).slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 8);
        const recentDaily = recent.filter(({ date, entry }) => entry || state.writings[date]?.draft || sessionsOnDate(date).length).slice(0, 10);
        const corrections = recent.flatMap(({ date, entry }) => entry?.correction ? [{ date, text: compact(entry.correction) }] : []).slice(0, 8);
        const dueLearningItems = state.library.filter(item => item.front && item.back && isLearningItemDue(item)).length;
        const dueSpellingItems = recentSpelling.filter(item => {
          const review = state.spellingProgress?.[item.id] || {};
          return !review.dueAt || new Date(review.dueAt) <= new Date();
        }).length;
        const latestNextFocus = recentPractice.find(record => compact(record.review?.next_focus))?.review?.next_focus || corrections[0]?.text || "Use two or three active learning items in spontaneous speaking or writing, then review only the errors that repeat.";
        const generated = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
        const profile = learnerProfile();
        const lines = [
          "# English Fluency Handoff", "",
          `Generated: ${generated}`,
          `Tracker: ${location.origin}/`, "",
          "## Learner and goal", "",
          `- Learner: ${profile.name || "not named"}`,
          `- Current level: ${profile.level}`,
          `- Target variety: natural, educated ${profile.variety}`,
          ...(profile.nativeLanguage ? [`- First language: ${profile.nativeLanguage}`] : []),
          `- Goal: ${profile.goals || `fluent, accurate, natural ${profile.variety}, with stronger collocations, phrasal verbs, grammar accuracy, register, rhythm, and spontaneous output`}`, "",
          "## Coaching instructions", "",
          `- Prefer natural, educated ${profile.variety}.`,
          "- Keep conversation flowing. Correct important or recurring errors, not every harmless stylistic difference.",
          `- Explain a phrase’s meaning, tone, register, and common ${profile.variety} use; then ask the learner to use it personally.`,
          "- During speaking, correct major mistakes briefly in the moment and give a focused review at the end.",
          "- Turn only reusable mistakes into learnables. Do not overfill the library.",
          "- Reward natural use of studied targets, never forced use.",
          "- End substantial practice with a short progress summary and one concrete next focus.",
          "- The tracker is the source of truth. Ask before changing or deleting saved data.", "",
          `## Current snapshot · last ${selectedDays} days`, "",
          `- Practiced days: ${practicedDates.size}`,
          `- Explicit rest days: ${restDates.size}`,
          `- Logged activity minutes: ${totalMinutesValue}`,
          `- Current return streak: ${returnStreak()} day${returnStreak() === 1 ? "" : "s"}`,
          `- Learning library: ${state.library.length} item${state.library.length === 1 ? "" : "s"}`,
          `- Smart-review cards due now: ${dueLearningItems}`,
          `- Spelling mistake words due now: ${dueSpellingItems}`,
          `- Detailed activity sessions in range: ${recentSessions.length}`,
          `- Writing drafts in range: ${recentWritings.length}`,
          `- Practice Zone sessions in range: ${recentPractice.length}`, "",
          "### Activity minutes", ""
        ];

        for (const activity of activities) lines.push(`- ${activity.name}: ${activityTotals[activity.id]} minutes`);
        lines.push("", "### Current priority", "", `- ${compact(latestNextFocus)}`, "", "### Recent daily records", "");
        if (!recentDaily.length) lines.push("- No detailed daily records in this period.");
        for (const { date, entry } of recentDaily) {
          const parts = [];
          if (entry) parts.push(entry.status === "rest" ? "rest day" : `${effectiveMinutesForDate(date)} minutes`);
          if (sessionsOnDate(date).length) parts.push(`${sessionsOnDate(date).length} detailed session${sessionsOnDate(date).length === 1 ? "" : "s"}`);
          if (state.writings[date]?.draft) parts.push(`${writingWordCount(state.writings[date].draft)}-word draft`);
          if (entry?.phrases?.length) parts.push(`phrases: ${entry.phrases.map(compact).join("; ")}`);
          if (entry?.question) parts.push(`question: ${compact(entry.question)}`);
          lines.push(`- ${date}: ${parts.join(" · ") || "recorded practice"}`);
        }

        lines.push("", "### Recent corrections and recurring issues", "");
        if (!corrections.length) lines.push("- No daily corrections recorded in this period.");
        for (const correction of corrections) lines.push(`- ${correction.date}: ${correction.text}`);

        lines.push("", "### Spelling and dictation priorities", "");
        if (!recentSpelling.length) lines.push("- No spelling mistakes saved yet.");
        for (const item of recentSpelling) lines.push(`- ${compact(item.word)}${item.misspellings?.length ? ` — previously written: ${item.misspellings.map(compact).join(", ")}` : ""}${item.meaning ? ` — ${compact(item.meaning)}` : ""}`);

        lines.push("", "### Active learning items · most recently updated", "");
        if (!recentLibrary.length) lines.push("- No learning items saved yet.");
        for (const item of recentLibrary) {
          const example = compact(item.example);
          lines.push(`- [${typeLabel(item.type)}] ${compact(item.front)} — ${compact(item.back)}${example ? ` Example: ${example}` : ""}`);
        }

        lines.push("", "### Recent detailed sessions", "");
        if (!recentSessions.length) lines.push("- No detailed listening, reading, shadowing, or speaking sessions in this period.");
        for (const record of recentSessions) lines.push(`- ${record.date} · ${sessionTypeLabels[record.type] || record.type} · ${Number(record.minutes) || 0} min${record.source ? ` · ${compact(record.source)}` : ""}${record.question ? ` · Question: ${compact(record.question)}` : ""}`);

        lines.push("", "### Recent writing", "");
        if (!recentWritings.length) lines.push("- No writing drafts in this period.");
        for (const record of recentWritings) lines.push(`- ${record.date} · ${writingTypeLabels[record.type] || record.type} · ${writingWordCount(record.draft)} words · ${record.review ? "reviewed" : "not reviewed"}${record.finalizedAt ? " · finalized" : ""}`);

        lines.push("", "### Recent Practice Zone results", "");
        if (!recentPractice.length) lines.push("- No Practice Zone sessions in this period.");
        for (const record of recentPractice) lines.push(`- ${practiceDate(record)} · ${compact(String(record.mode || "practice").replaceAll("_", " "))}${record.review?.scores?.overall != null ? ` · ${Math.round(Number(record.review.scores.overall))}/100` : " · not yet scored"}${record.review?.next_focus ? ` · Next: ${compact(record.review.next_focus)}` : ""}`);

        lines.push("", "## Start the next session", "", "1. Confirm the current priority and choose two or three active targets.", "2. Ask one short warm-up question that invites spontaneous output.", "3. Practice through conversation, voice, or a short writing task.", "4. Give precise feedback, save only reusable mistakes, and finish with the next focus.", "");
        return lines.join("\n");
      }

      function renderProjectHandoff() {
        const days = Number($("#handoffDays")?.value) || 30;
        const brief = buildProjectHandoff(days);
        $("#handoffPreview").value = brief;
        $("#handoffMeta").textContent = `Generated from this browser’s current tracker data · ${brief.split("\n").length} lines`;
        return brief;
      }

      async function copyProjectHandoff() {
        const brief = renderProjectHandoff();
        await copyText(brief);
        $("#handoffState").textContent = "Copied. Paste it at the start of a new chat with any AI assistant.";
        setTimeout(() => $("#handoffState").textContent = "", 3500);
      }

      function downloadProjectHandoff() {
        const brief = renderProjectHandoff();
        downloadFile(`english-fluency-handoff-${localDate()}.md`, brief, "text/markdown;charset=utf-8");
        $("#handoffState").textContent = "Downloaded the current Markdown handoff.";
        setTimeout(() => $("#handoffState").textContent = "", 3500);
      }

      function oneLine(value) {
        return String(value || "").replace(/[\t\r\n]+/g, " ").trim();
      }

      function exportAnki() {
        const items = state.library.filter(item => item.front && item.back);
        if (!items.length) {
          $("#librarySaveState").textContent = "Complete at least one library item before exporting.";
          return;
        }
        const header = ["#separator:Tab", "#html:false", "#deck:English Fluency", "#columns:Front\tBack\tExample\tType\tSource\tTags", "#tags column:6"];
        const rows = items.map(item => [item.front, item.back, item.example, typeLabel(item.type), item.source, [item.type, ...(item.tags || [])].join(" ")].map(oneLine).join("\t"));
        downloadFile("english-fluency-anki.txt", [...header, ...rows].join("\n"), "text/plain;charset=utf-8");
        $("#librarySaveState").textContent = `Downloaded ${items.length} Anki card${items.length === 1 ? "" : "s"}.`;
      }

      function exportNotebook() {
        const items = state.library.filter(item => item.front && item.back);
        if (!items.length) {
          $("#librarySaveState").textContent = "Complete at least one library item before exporting.";
          return;
        }
        const lines = [
          "# English Fluency Learning Library", "",
          `Exported ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`, "",
          "## Suggested NotebookLM prompt", "",
          `Create a study session from this source. First make 10 mixed questions using multiple choice, fill-in-the-blank, and sentence correction. Prioritize natural ${englishVariety()} usage and ask me to produce my own examples. After I answer, explain mistakes briefly and make flashcards only for the items I missed.`, ""
        ];
        for (const type of ["collocation", "phrasal_verb", "grammar", "vocabulary"]) {
          const group = items.filter(item => item.type === type);
          if (!group.length) continue;
          lines.push(`## ${group.length === 1 ? typeLabel(type) : libraryTypePlurals[type]}`, "");
          for (const item of group) {
            lines.push(`### ${item.front}`, "", `- Meaning or rule: ${item.back}`);
            if (item.example) lines.push(`- Personal example: ${item.example}`);
            if (item.source) lines.push(`- Source: ${item.source}`);
            if (item.tags?.length) lines.push(`- Tags: ${item.tags.join(", ")}`);
            lines.push("");
          }
        }
        downloadFile("english-fluency-notebooklm.md", lines.join("\n"), "text/markdown;charset=utf-8");
        $("#librarySaveState").textContent = `Downloaded a NotebookLM source with ${items.length} item${items.length === 1 ? "" : "s"}.`;
      }

      function saveCurrent() {
        const date = $("#entryDate").value || localDate();
        state.entries[date] = collectForm();
        clearDailyDraft(date);
        saveState(state);
        renderProgress();
        $("#saveState").textContent = `Saved ${formatDate(date)}.`;
        setTimeout(() => $("#saveState").textContent = "", 2500);
      }

      function clearForm() {
        const date = $("#entryDate").value || localDate();
        setForm(null);
        clearDailyDraft(date);
        $("#saveState").textContent = "Form cleared. Save only if you want to replace the day.";
      }

      async function copyMessage() {
        const text = $("#chatMessage").value;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          $("#chatMessage").select();
          document.execCommand("copy");
        }
        const button = $("#copyBtn");
        const original = button.textContent;
        button.textContent = "Copied — paste it here";
        setTimeout(() => button.textContent = original, 2200);
      }

      function validateEntryInput(input) {
        if (!input || typeof input !== "object") throw new Error("An entry object is required.");
        const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : localDate();
        const status = ["practiced", "light", "rest"].includes(input.status) ? input.status : "practiced";
        const done = {};
        if (input.activities && typeof input.activities === "object") {
          for (const [id, minutes] of Object.entries(input.activities)) {
            if (!activities.some(item => item.id === id)) throw new Error(`Unknown activity: ${id}`);
            const n = Number(minutes);
            if (!Number.isFinite(n) || n < 0 || n > 300) throw new Error(`Invalid minutes for ${id}`);
            done[id] = Math.round(n);
          }
        }
        return {
          date,
          entry: {
            status,
            activities: done,
            phrases: Array.isArray(input.phrases) ? input.phrases.map(String).map(s => s.trim()).filter(Boolean).slice(0, 3) : [],
            question: typeof input.question === "string" ? input.question.trim() : "",
            correction: typeof input.correction === "string" ? input.correction.trim() : "",
            notes: typeof input.notes === "string" ? input.notes.trim() : "",
            updatedAt: new Date().toISOString()
          }
        };
      }

      function registerAgentTools() {
        const context = document.modelContext;
        if (!context?.registerTool) return;
        const register = (tool) => Promise.resolve(context.registerTool(tool)).catch(() => {});
        register({
          name: "save_daily_english_entry",
          title: "Save daily English entry",
          description: "Save or replace one date in the visible English fluency tracker, including any combination of activities, a rest day, phrases, questions, and corrections.",
          inputSchema: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date in YYYY-MM-DD format." },
              status: { type: "string", enum: ["practiced", "light", "rest"] },
              activities: { type: "object", additionalProperties: { type: "number", minimum: 0, maximum: 300 }, description: "Minutes keyed by listening, shadowing, speaking, chat, reading, grammar, chunks, writing, or review." },
              phrases: { type: "array", maxItems: 3, items: { type: "string" } },
              question: { type: "string" },
              correction: { type: "string" },
              notes: { type: "string" }
            },
            required: ["date", "status"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            const { date, entry } = validateEntryInput(input);
            state.entries[date] = entry;
            clearDailyDraft(date);
            saveState(state);
            if ($("#entryDate").value === date) setForm(entry);
            renderProgress();
            return { saved: true, date, status: entry.status, totalMinutes: totalMinutes(entry) };
          }
        });
        register({
          name: "read_english_progress",
          title: "Read English progress",
          description: "Read a concise summary of recent practice saved in this tracker.",
          inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 30, default: 7 } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const days = Math.min(30, Math.max(1, Number(input?.days) || 7));
            const window = getWindow(days);
            return {
              days,
              practicedDays: window.filter(x => (x.entry && x.entry.status !== "rest") || state.writings[x.date]?.draft || sessionsOnDate(x.date).length).length,
              restDays: window.filter(x => x.entry?.status === "rest").length,
              totalMinutes: window.reduce((sum, x) => sum + effectiveMinutesForDate(x.date), 0),
              questions: window.flatMap(x => x.entry?.question ? [{ date: x.date, question: x.entry.question }] : [])
            };
          }
        });
        register({
          name: "prepare_english_project_handoff",
          title: "Prepare English project handoff",
          description: "Create a Markdown handoff with the learner's coaching preferences, recent progress, active learning items, corrections, detailed sessions, writing, and Practice Zone results.",
          inputSchema: { type: "object", properties: { days: { type: "integer", enum: [7, 30], default: 30 } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const days = Number(input?.days) === 7 ? 7 : 30;
            return { days, generated_at: new Date().toISOString(), markdown: buildProjectHandoff(days) };
          }
        });
        register({
          name: "prepare_english_checkin_message",
          title: "Prepare check-in message",
          description: "Create the same daily check-in message shown in the tracker for a saved date.",
          inputSchema: { type: "object", properties: { date: { type: "string" } }, required: ["date"], additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date || "")) throw new Error("Use YYYY-MM-DD.");
            const entry = state.entries[input.date];
            if (!entry) throw new Error("No saved entry for that date.");
            return { date: input.date, message: makeMessage(input.date, entry) };
          }
        });
        register({
          name: "save_english_learning_item",
          title: "Save English learning item",
          description: "Add a collocation, phrasal verb, grammar point, or vocabulary item to the visible learning library used for flashcards and quizzes.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["collocation", "phrasal_verb", "grammar", "vocabulary"] },
              front: { type: "string", description: "Expression, phrasal verb, word, or grammar point." },
              back: { type: "string", description: "Meaning, pattern, or grammar rule." },
              example: { type: "string" },
              source: { type: "string" },
              tags: { type: "array", items: { type: "string" } }
            },
            required: ["type", "front", "back"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            if (!["collocation", "phrasal_verb", "grammar", "vocabulary"].includes(input?.type)) throw new Error("Choose a valid item type.");
            const front = String(input.front || "").trim();
            const back = String(input.back || "").trim();
            if (!front || !back) throw new Error("The item needs both a prompt and an answer.");
            const existing = state.library.find(item => item.front.toLowerCase() === front.toLowerCase() && item.type === input.type);
            const item = {
              id: existing?.id || makeId(), type: input.type, front, back,
              example: String(input.example || "").trim(), source: String(input.source || "").trim(),
              tags: Array.isArray(input.tags) ? input.tags.map(String).map(tag => tag.trim()).filter(Boolean) : [],
              createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            if (existing) state.library = state.library.map(value => value.id === existing.id ? item : value);
            else state.library.push(item);
            if (item.tags.some(tag => /mistake/i.test(tag))) recordLearningOutcome(item.id, "again", item.source || "saved mistake");
            saveState(state);
            renderLibrary();
            return { saved: true, id: item.id, type: item.type, front: item.front };
          }
        });
        register({
          name: "read_english_learning_library",
          title: "Read English learning library",
          description: "Read saved collocations, phrasal verbs, grammar points, and vocabulary from the tracker, optionally filtered by type.",
          inputSchema: { type: "object", properties: { type: { type: "string", enum: ["all", "collocation", "phrasal_verb", "grammar", "vocabulary"], default: "all" } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const type = input?.type || "all";
            const items = state.library.filter(item => type === "all" || item.type === type);
            return { count: items.length, items: items.map(({ id, type, front, back, example, source, tags }) => ({ id, type, front, back, example, source, tags })) };
          }
        });
        register({
          name: "read_due_english_learning_items",
          title: "Read due English learning items",
          description: "Read completed learning items that are due now, ordered with mistakes and difficult items first.",
          inputSchema: { type: "object", properties: { type: { type: "string", enum: ["all", "collocation", "phrasal_verb", "grammar", "vocabulary"], default: "all" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const type = input?.type || "all";
            const limit = Math.min(50, Math.max(1, Number(input?.limit) || 20));
            const items = smartStudyOrder(state.library.filter(item => item.front && item.back && isLearningItemDue(item) && (type === "all" || item.type === type))).slice(0, limit);
            return { count: items.length, items: items.map(item => ({ id: item.id, type: item.type, front: item.front, back: item.back, example: item.example || "", schedule: learningScheduleLabel(item), stats: normalizedLearningReview(item.id) })) };
          }
        });
        register({
          name: "read_english_spelling_queue",
          title: "Read spelling and dictation queue",
          description: "Read saved spelling mistakes and vocabulary due for spelling or dictation practice, with mistake words first.",
          inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }, mistakes_only: { type: "boolean", default: false } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const limit = Math.min(50, Math.max(1, Number(input?.limit) || 20));
            const mistakesOnly = Boolean(input?.mistakes_only);
            const mistakeItems = (state.spellingItems || []).map(item => ({
              id: item.id, word: item.word, meaning: item.meaning || "", example: item.example || "", misspellings: item.misspellings || [],
              source: item.source || "Practice review", explicit_mistake: true, progress: state.spellingProgress?.[item.id] || {}
            }));
            const seen = new Set(mistakeItems.map(item => item.word.toLowerCase()));
            const vocabulary = mistakesOnly ? [] : state.library.filter(item => item.type === "vocabulary" && item.front && item.back && !seen.has(item.front.toLowerCase())).map(item => ({
              id: `library:${item.id}`, word: item.front, meaning: item.back, example: item.example || "", misspellings: [], source: item.source || "Learning library",
              explicit_mistake: (item.tags || []).some(tag => /mistake/i.test(tag)), progress: state.spellingProgress?.[`library:${item.id}`] || {}
            }));
            const items = [...mistakeItems, ...vocabulary].filter(item => !item.progress.dueAt || new Date(item.progress.dueAt) <= new Date()).sort((a, b) => {
              const score = item => (item.progress.lastResult === "wrong" ? 100 : 0) + (item.explicit_mistake ? 60 : 0) + (!item.progress.seen ? 20 : 0);
              return score(b) - score(a);
            }).slice(0, limit);
            return { count: items.length, items };
          }
        });
        register({
          name: "record_english_learning_outcome",
          title: "Record English learning outcome",
          description: "Record whether the learner understood a learning item or needs to see it again, updating its spaced-repetition schedule.",
          inputSchema: { type: "object", properties: { id: { type: "string" }, result: { type: "string", enum: ["understood", "again"] }, source: { type: "string" } }, required: ["id", "result"], additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            const review = recordLearningOutcome(input.id, input.result === "understood" ? "right" : "again", String(input.source || "chat practice"));
            if (!review) throw new Error("The matching learning item was not found.");
            saveState(state);
            renderLibrary();
            return { saved: true, id: input.id, result: input.result, due_at: review.dueAt, interval_days: review.intervalDays };
          }
        });
        register({
          name: "prepare_english_example_review",
          title: "Prepare English example review",
          description: "Prepare a review request for selected learning-library item IDs so their examples can be checked for natural English in the learner's chosen variety.",
          inputSchema: { type: "object", properties: { ids: { type: "array", minItems: 1, items: { type: "string" } } }, required: ["ids"], additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const wanted = new Set(input.ids);
            const items = state.library.filter(item => wanted.has(item.id));
            if (!items.length) throw new Error("No matching library items were found.");
            return { count: items.length, prompt: makeReviewPrompt(items) };
          }
        });
        register({
          name: "apply_english_example_reviews",
          title: "Apply English example reviews",
          description: "Apply reviewed example corrections to matching library items and create reusable mistake-based learning items when supplied.",
          inputSchema: {
            type: "object",
            properties: {
              review_version: { type: "integer", const: 1 },
              reviews: { type: "array", items: {
                type: "object",
                properties: {
                  id: { type: "string" }, verdict: { type: "string", enum: ["correct", "minor", "major"] },
                  corrected_example: { type: "string" }, explanation: { type: "string" },
                  new_items: { type: "array", maxItems: 2, items: { type: "object", properties: {
                    type: { type: "string", enum: ["grammar", "collocation", "phrasal_verb", "vocabulary"] },
                    front: { type: "string" }, back: { type: "string" }, example: { type: "string" }
                  }, required: ["type", "front", "back"], additionalProperties: false } }
                },
                required: ["id", "verdict", "corrected_example", "explanation"], additionalProperties: false
              } }
            },
            required: ["review_version", "reviews"], additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) { return applyReviewPayload(input); }
        });
        register({
          name: "save_english_writing_draft",
          title: "Save English writing draft",
          description: "Save or update one dated writing draft in the Writing Lab.",
          inputSchema: {
            type: "object",
            properties: {
              date: { type: "string" }, type: { type: "string", enum: ["casual_message", "email", "journal", "summary", "opinion", "professional"] },
              prompt: { type: "string" }, target_words: { type: "integer", minimum: 0, maximum: 1000 },
              target_items: { type: "array", maxItems: 5, items: { type: "string" } }, draft: { type: "string" }
            },
            required: ["date", "type", "draft"], additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) throw new Error("Use YYYY-MM-DD.");
            const draft = String(input.draft || "").trim();
            if (!draft) throw new Error("The draft cannot be empty.");
            const existing = state.writings[input.date];
            const record = {
              id: existing?.id || makeId(), date: input.date, type: input.type,
              prompt: String(input.prompt || "").trim(), targetWords: Number(input.target_words) || 0,
              targetItems: Array.isArray(input.target_items) ? input.target_items.map(String).map(value => value.trim()).filter(Boolean).slice(0, 5) : [],
              draft, checks: existing?.checks || [], review: existing?.draft === draft ? existing.review || null : null,
              rewrite: existing?.draft === draft ? existing.rewrite || "" : "", finalizedAt: existing?.draft === draft ? existing.finalizedAt || null : null,
              createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            state.writings[input.date] = record;
            saveState(state);
            renderWritingHistory();
            renderProgress();
            return { saved: true, date: record.date, words: writingWordCount(record.draft) };
          }
        });
        register({
          name: "read_english_writing_records",
          title: "Read English writing records",
          description: "Read saved Writing Lab drafts and their review status.",
          inputSchema: { type: "object", properties: { date: { type: "string" } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const records = Object.values(state.writings).filter(record => !input?.date || record.date === input.date).sort((a, b) => b.date.localeCompare(a.date));
            return { count: records.length, records: records.map(record => ({ date: record.date, type: record.type, prompt: record.prompt, draft: record.draft, rewrite: record.rewrite, reviewed: Boolean(record.review), finalized: Boolean(record.finalizedAt) })) };
          }
        });
        register({
          name: "prepare_english_writing_review",
          title: "Prepare English writing review",
          description: "Prepare the chat review request for one saved Writing Lab draft.",
          inputSchema: { type: "object", properties: { date: { type: "string" } }, required: ["date"], additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const record = state.writings[input.date];
            if (!record) throw new Error("No saved writing draft exists for that date.");
            return { date: record.date, prompt: makeWritingReviewPrompt(record) };
          }
        });
        register({
          name: "save_english_activity_session",
          title: "Save English activity session",
          description: "Save a detailed listening, reading, shadowing, or speaking record in the Activity Session Log.",
          inputSchema: {
            type: "object",
            properties: {
              date: { type: "string" }, type: { type: "string", enum: ["listening", "reading", "shadowing", "speaking"] },
              minutes: { type: "integer", minimum: 0, maximum: 300 }, confidence: { type: "integer", minimum: 1, maximum: 5 },
              source: { type: "string" }, url: { type: "string" }, detail: { type: "string" }, quantity: { type: "integer", minimum: 0, maximum: 999 },
              evidence: { type: "string" }, phrases: { type: "array", maxItems: 8, items: { type: "string" } }, question: { type: "string" }
            },
            required: ["date", "type", "minutes"], additionalProperties: false
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute(input) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) throw new Error("Use YYYY-MM-DD.");
            if (!Object.prototype.hasOwnProperty.call(sessionTypeLabels, input.type)) throw new Error("Choose a valid activity type.");
            const record = {
              id: makeId(), date: input.date, type: input.type, minutes: Math.round(Number(input.minutes) || 0), rating: Number(input.confidence) || 3,
              source: String(input.source || "").trim(), url: String(input.url || "").trim(), detail: String(input.detail || "").trim(), quantity: Number(input.quantity) || 0,
              evidence: String(input.evidence || "").trim(), phrases: Array.isArray(input.phrases) ? input.phrases.map(String).map(value => value.trim()).filter(Boolean).slice(0, 8) : [],
              question: String(input.question || "").trim(), review: null, finalizedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            if (!record.source && !record.evidence && !record.question) throw new Error("Add a source, summary, or question.");
            state.sessions.push(record);
            saveState(state);
            renderSessionHistory();
            renderProgress();
            return { saved: true, id: record.id, date: record.date, type: record.type };
          }
        });
        register({
          name: "read_english_activity_sessions",
          title: "Read English activity sessions",
          description: "Read detailed listening, reading, shadowing, and speaking records, optionally filtered by date or type.",
          inputSchema: { type: "object", properties: { date: { type: "string" }, type: { type: "string", enum: ["all", "listening", "reading", "shadowing", "speaking"], default: "all" } }, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const type = input?.type || "all";
            const records = state.sessions.filter(record => (!input?.date || record.date === input.date) && (type === "all" || record.type === type)).sort((a, b) => b.date.localeCompare(a.date));
            return { count: records.length, records: records.map(record => ({ id: record.id, date: record.date, type: record.type, minutes: record.minutes, confidence: record.rating, source: record.source, url: record.url, detail: record.detail, quantity: record.quantity, evidence: record.evidence, phrases: record.phrases, question: record.question, reviewed: Boolean(record.review), finalized: Boolean(record.finalizedAt) })) };
          }
        });
        register({
          name: "prepare_english_activity_review",
          title: "Prepare English activity review",
          description: "Prepare the chat review request for one saved Activity Session Log record.",
          inputSchema: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"], additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            const record = state.sessions.find(value => value.id === input.session_id);
            if (!record) throw new Error("No matching activity session was found.");
            return { id: record.id, date: record.date, type: record.type, prompt: makeSessionReviewPrompt(record) };
          }
        });
      }

      renderActivities();
      renderSchedule();
      $("#entryDate").value = localDate();
      $("#writingDate").value = localDate();
      $("#sessionDate").value = localDate();
      $("#todayBadge").innerHTML = `Today<br><strong>${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong>`;
      setForm(dailyDraftFor(localDate()) || state.entries[localDate()] || null);
      setWritingForm(state.writings[localDate()] || null, localDate());
      setSessionForm(null, localDate());
      renderWritingHistory();
      renderSessionHistory();
      renderProgress();
      renderLibrary();
      renderProjectHandoff();
      registerAgentTools();
      window.fluencyTracker = {
        getState: () => state,
        saveState: () => {
          saveState(state);
          const visibleDate = $("#entryDate").value;
          if (visibleDate) setForm(dailyDraftFor(visibleDate) || state.entries[visibleDate] || null);
          renderLibrary(); renderProgress(); renderProjectHandoff();
        },
        notify: (message, tone = "success") => showToast(message, tone),
        addLibraryItem: item => {
          if (!item?.front || !item?.back) return false;
          const existing = state.library.find(value => value.type === item.type && value.front.toLowerCase() === item.front.toLowerCase());
          const mistake = (item.tags || []).some(tag => /mistake/i.test(tag));
          if (existing) {
            if (mistake) {
              recordLearningOutcome(existing.id, "again", item.source || "practice mistake");
              saveState(state); renderLibrary(); renderProgress(); renderProjectHandoff();
            }
            return false;
          }
          const added = { ...item, id: item.id || makeId(), createdAt: item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
          state.library.push(added);
          if (mistake) recordLearningOutcome(added.id, "again", item.source || "practice mistake");
          saveState(state); renderLibrary(); renderProgress(); renderProjectHandoff(); return true;
        },
        recordLearningOutcome: (id, result, source = "practice") => {
          const review = recordLearningOutcome(id, result, source);
          if (!review) return false;
          saveState(state); renderLibrary(); renderProgress(); renderProjectHandoff();
          return true;
        },
        refresh: () => { renderLibrary(); renderProgress(); renderProjectHandoff(); },
        getProfile: () => learnerProfile(),
        getAccount: () => ({ user: accountUser, config: serverConfig, syncConnected }),
        openTab: tabId => openTrackerTab(tabId, { updateHash: true, scroll: true })
      };

      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      const initialTrackerTab = location.hash.replace("#", "");
      openTrackerTab(trackerTabIds.includes(initialTrackerTab) ? initialTrackerTab : "today", { instant: true });
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
      $(".jump-nav").addEventListener("click", event => {
        const tab = event.target.closest("[data-tab]");
        if (!tab) return;
        event.preventDefault();
        openTrackerTab(tab.dataset.tab, { updateHash: true, scroll: true });
      });
      $(".jump-nav").addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = trackerTabIds.indexOf(document.activeElement?.dataset?.tab || "today");
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? trackerTabIds.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + trackerTabIds.length) % trackerTabIds.length;
        openTrackerTab(trackerTabIds[nextIndex], { updateHash: true, focus: true });
      });
      window.addEventListener("popstate", () => openTrackerTab(location.hash.replace("#", "") || "today"));
      window.addEventListener("hashchange", () => openTrackerTab(location.hash.replace("#", "") || "today"));

      $("#entryDate").addEventListener("change", event => {
        setForm(dailyDraftFor(event.target.value) || state.entries[event.target.value] || null);
        if (event.target.value) {
          progressAnchor = parseDate(event.target.value);
          renderProgress();
        }
      });
      $("#calendarViewSwitch").addEventListener("click", event => {
        const button = event.target.closest("[data-calendar-view]");
        if (!button) return;
        progressView = button.dataset.calendarView;
        renderProgress();
      });
      function moveCalendar(direction) {
        const next = new Date(progressAnchor);
        if (progressView === "day") next.setDate(next.getDate() + direction);
        else if (progressView === "week") next.setDate(next.getDate() + (7 * direction));
        else if (progressView === "month") {
          next.setDate(1);
          next.setMonth(next.getMonth() + direction);
        } else {
          next.setDate(1);
          next.setMonth(0);
          next.setFullYear(next.getFullYear() + direction);
        }
        progressAnchor = next;
        renderProgress();
      }
      $("#calendarPrev").addEventListener("click", () => moveCalendar(-1));
      $("#calendarNext").addEventListener("click", () => moveCalendar(1));
      $("#calendarToday").addEventListener("click", () => {
        progressAnchor = parseDate(localDate());
        renderProgress();
      });
      $("#calendarView").addEventListener("click", event => {
        const button = event.target.closest("[data-calendar-date]");
        if (!button) return;
        const date = button.dataset.calendarDate;
        progressAnchor = parseDate(date);
        $("#entryDate").value = date;
        setForm(dailyDraftFor(date) || state.entries[date] || null);
        renderProgress();
        showToast(`${formatDate(date, { month: "long", day: "numeric", year: "numeric" })} is loaded in the daily check-in.`);
        openTrackerTab("today", { updateHash: true, scroll: true });
      });
      $$('input[name="status"]').forEach(input => input.addEventListener("change", handleDailyFormChange));
      $("#handoffDays").addEventListener("change", renderProjectHandoff);
      $("#refreshHandoffBtn").addEventListener("click", () => {
        renderProjectHandoff();
        $("#handoffState").textContent = "Preview refreshed from the latest saved tracker data.";
        setTimeout(() => $("#handoffState").textContent = "", 2800);
      });
      $("#copyHandoffBtn").addEventListener("click", copyProjectHandoff);
      $("#downloadHandoffBtn").addEventListener("click", downloadProjectHandoff);
      $$(".phrase, #question, #correction, #notes").forEach(input => input.addEventListener("input", handleDailyFormChange));
      $("#saveBtn").addEventListener("click", saveCurrent);
      $("#savePhrasesBtn").addEventListener("click", savePhrasesToLibrary);
      $("#clearBtn").addEventListener("click", clearForm);
      $("#copyBtn").addEventListener("click", copyMessage);
      $("#writingDraft").addEventListener("input", updateWritingWordCount);
      $("#writingTarget").addEventListener("input", updateWritingWordCount);
      $("#writingDate").addEventListener("change", event => setWritingForm(state.writings[event.target.value] || null, event.target.value));
      $("#saveWritingBtn").addEventListener("click", () => saveWritingDraft(true));
      $("#copyWritingReviewBtn").addEventListener("click", copyWritingReview);
      $("#applyWritingReviewBtn").addEventListener("click", () => applyWritingReview());
      $("#clearWritingBtn").addEventListener("click", () => {
        const date = $("#writingDate").value || localDate();
        setWritingForm(null, date);
        $("#writingSaveState").textContent = "Form cleared. Saved drafts were not deleted.";
      });
      $("#writingHistory").addEventListener("click", event => {
        const button = event.target.closest("[data-writing-date]");
        if (!button) return;
        setWritingForm(state.writings[button.dataset.writingDate], button.dataset.writingDate);
        openTrackerTab("writing", { updateHash: true, scroll: true });
      });
      $("#writingFeedback").addEventListener("click", event => {
        if (event.target.closest('[data-writing-action="finalize"]')) finalizeWriting();
      });
      $("#sessionType").addEventListener("change", syncSessionFields);
      $("#saveSessionBtn").addEventListener("click", () => saveSession(true));
      $("#copySessionReviewBtn").addEventListener("click", copySessionReview);
      $("#clearSessionBtn").addEventListener("click", clearSessionForm);
      $("#applySessionReviewBtn").addEventListener("click", () => applySessionReview());
      $("#sessionFilter").addEventListener("change", renderSessionHistory);
      $("#sessionSearch").addEventListener("input", renderSessionHistory);
      $("#sessionHistory").addEventListener("click", event => {
        const button = event.target.closest("[data-session-id]");
        if (!button) return;
        const record = state.sessions.find(value => value.id === button.dataset.sessionId);
        if (!record) return;
        resetRecording();
        setSessionForm(record, record.date);
        openTrackerTab("sessions", { updateHash: true, scroll: true });
      });
      $("#sessionFeedback").addEventListener("click", event => {
        const button = event.target.closest('[data-session-action="finalize"]');
        if (button) finalizeSessionReview(button.dataset.sessionId);
      });
      $("#startRecordingBtn").addEventListener("click", startRecording);
      $("#stopRecordingBtn").addEventListener("click", stopRecording);
      $("#libraryForm").addEventListener("submit", saveLibraryItem);
      $("#libraryCancelBtn").addEventListener("click", resetLibraryForm);
      $("#libraryFilter").addEventListener("change", renderLibrary);
      $("#libraryDateFilter").addEventListener("change", renderLibrary);
      $("#librarySearch").addEventListener("input", renderLibrary);
      $("#libraryList").addEventListener("change", event => {
        const checkbox = event.target.closest("input[data-review-select]");
        if (!checkbox) return;
        if (checkbox.checked) selectedReviewIds.add(checkbox.dataset.reviewSelect);
        else selectedReviewIds.delete(checkbox.dataset.reviewSelect);
        checkbox.closest(".library-card")?.classList.toggle("selected", checkbox.checked);
        renderReviewSelection();
      });
      $("#libraryList").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        const card = event.target.closest("[data-id]");
        if (!button || !card) return;
        if (button.dataset.action === "review") copyReviewPrompt([card.dataset.id], button);
        if (button.dataset.action === "finalize") finalizeReview(card.dataset.id);
        if (button.dataset.action === "edit") editLibraryItem(card.dataset.id);
        if (button.dataset.action === "delete") deleteLibraryItem(card.dataset.id);
      });
      $("#libraryTrashList").addEventListener("click", event => {
        const button = event.target.closest("[data-trash-action]");
        const row = event.target.closest("[data-trash-id]");
        if (button?.dataset.trashAction === "restore" && row) restoreLibraryItem(row.dataset.trashId);
      });
      $("#selectVisibleReviewBtn").addEventListener("click", () => {
        $$('#libraryList .library-card[data-reviewable="true"]').forEach(card => selectedReviewIds.add(card.dataset.id));
        renderLibrary();
      });
      $("#clearReviewBtn").addEventListener("click", () => {
        selectedReviewIds.clear();
        renderLibrary();
      });
      $("#copyReviewBtn").addEventListener("click", event => copyReviewPrompt([...selectedReviewIds], event.currentTarget));
      $("#applyReviewBtn").addEventListener("click", applyPastedReview);
      $("#ankiExportBtn").addEventListener("click", exportAnki);
      $("#notebookExportBtn").addEventListener("click", exportNotebook);
      $("#startCardsBtn").addEventListener("click", () => startStudy("cards"));
      $("#startQuizBtn").addEventListener("click", () => startStudy("quiz"));
      $("#studyFilter").addEventListener("change", renderStudyOverview);
      $("#studyScope").addEventListener("change", renderStudyOverview);
      $("#studySurface").addEventListener("click", event => {
        const option = event.target.closest("[data-option]");
        if (option) return answerQuiz(option.dataset.option);
        const action = event.target.closest("[data-study]")?.dataset.study;
        if (!action) return;
        const card = event.target.closest(".study-card");
        if (action === "reveal") {
          card.classList.add("revealed");
          event.target.hidden = true;
          card.querySelector('[data-study="again"]').hidden = false;
          card.querySelector('[data-study="right"]').hidden = false;
        } else if (action === "again" || action === "right") {
          submitStudyResult(action);
        } else if (action === "save-next") {
          savePersonalStudySentence();
        } else if (action === "next") nextStudy();
      });
      $("#openSyncBtn").addEventListener("click", () => openTrackerTab("settings", { updateHash: true, scroll: true }));
      $("#syncNowBtn").addEventListener("click", () => syncNow());
      $("#signOutBtn").addEventListener("click", () => signOut());
      $("#deleteAccountBtn").addEventListener("click", () => deleteAccount());

      function fillProfileForm() {
        const profile = learnerProfile();
        $("#profileName").value = profile.name;
        $("#profileVariety").value = profile.variety;
        $("#profileLevel").value = state.profile?.level ? profile.level : "";
        $("#profileNativeLanguage").value = profile.nativeLanguage;
        $("#profileGoals").value = profile.goals;
      }
      $("#profileForm").addEventListener("submit", event => {
        event.preventDefault();
        state.profile = {
          name: $("#profileName").value.trim().slice(0, 60),
          variety: ENGLISH_VARIETIES.includes($("#profileVariety").value) ? $("#profileVariety").value : "American English",
          level: $("#profileLevel").value.trim().slice(0, 120),
          nativeLanguage: $("#profileNativeLanguage").value.trim().slice(0, 60),
          goals: $("#profileGoals").value.trim().slice(0, 400),
          updatedAt: new Date().toISOString()
        };
        saveState(state);
        renderVariety();
        renderProjectHandoff();
        $("#profileState").textContent = "Profile saved.";
        setTimeout(() => $("#profileState").textContent = "", 2500);
      });
      window.addEventListener("fluency-state-updated", fillProfileForm);

      $("#exportBackupBtn").addEventListener("click", () => {
        downloadFile(`english-fluency-backup-${localDate()}.json`, JSON.stringify({ format: "english-fluency-tracker-backup", version: 1, exportedAt: new Date().toISOString(), state }, null, 2), "application/json;charset=utf-8");
        $("#backupState").textContent = "Backup downloaded.";
        setTimeout(() => $("#backupState").textContent = "", 3000);
      });
      $("#importBackupBtn").addEventListener("click", () => $("#importBackupInput").click());
      $("#importBackupInput").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
          if (file.size > 5000000) throw new Error("That file is too large to be a tracker backup.");
          const parsed = JSON.parse(await file.text());
          const incoming = parsed?.format === "english-fluency-tracker-backup" ? parsed.state : parsed;
          if (!incoming || typeof incoming !== "object" || !incoming.entries) throw new Error("This file is not an English Fluency Tracker backup.");
          state = migrateStoredState(normalizeStateShape(mergeTrackerStates(state, normalizeStateShape(incoming))));
          saveState(state);
          refreshAfterCloudMerge();
          $("#backupState").textContent = "Backup merged into this tracker.";
          showToast("Backup imported. Existing records were kept; matching records use the newest copy.");
        } catch (error) {
          $("#backupState").textContent = error instanceof Error ? error.message : "The backup could not be imported.";
        }
      });

      async function runWithAi(button, busyLabel, task) {
        if (!window.FluencyAI?.available()) {
          showToast("Connect an AI in Settings first, or use Copy prompt with any AI chat.", "error");
          return;
        }
        const original = button.textContent;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = busyLabel;
        try {
          await task();
        } catch (error) {
          showToast(error instanceof Error ? error.message : "The AI request failed.", "error");
        } finally {
          button.textContent = original;
          button.removeAttribute("aria-busy");
          button.disabled = !window.FluencyAI?.available();
        }
      }
      $("#aiReviewBtn").addEventListener("click", event => runWithAi(event.currentTarget, "Checking…", async () => {
        const items = state.library.filter(item => selectedReviewIds.has(item.id));
        if (!items.length) throw new Error("Select at least one library item first.");
        if (items.length > 25) throw new Error("Check up to 25 items at a time.");
        const response = await window.FluencyAI.run("library_review", { prompt: makeReviewPrompt(items) });
        const result = applyReviewPayload({ ...response.result, review_version: 1, reviews: Array.isArray(response.result?.reviews) ? response.result.reviews : [] });
        const message = `Applied ${result.updated} review${result.updated === 1 ? "" : "s"} and created ${result.created} new learning item${result.created === 1 ? "" : "s"}.`;
        $("#reviewApplyState").textContent = message;
        showToast(message);
      }));
      $("#aiWritingReviewBtn").addEventListener("click", event => runWithAi(event.currentTarget, "Reviewing…", async () => {
        const record = saveWritingDraft(false);
        if (!record) return;
        const response = await window.FluencyAI.run("writing_review", { prompt: makeWritingReviewPrompt(record) });
        applyWritingReview({ ...response.result, writing_review_version: 1, date: record.date });
      }));
      $("#aiSessionReviewBtn").addEventListener("click", event => runWithAi(event.currentTarget, "Reviewing…", async () => {
        const record = saveSession(false);
        if (!record) return;
        const response = await window.FluencyAI.run("activity_review", { prompt: makeSessionReviewPrompt(record) });
        applySessionReview({ ...response.result, activity_review_version: 1, session_id: record.id });
      }));

      const refreshCloudWhenActive = () => {
        if (document.visibilityState === "visible" && syncConnected && Date.now() - lastCloudPullAt > 15000) syncNow({ quiet: true });
      };
      window.addEventListener("focus", refreshCloudWhenActive);
      document.addEventListener("visibilitychange", refreshCloudWhenActive);
      setInterval(() => {
        if (document.visibilityState === "visible" && syncConnected) syncNow({ quiet: true });
      }, 60000);

      const signInResult = new URLSearchParams(location.search).get("signin");
      if (signInResult) history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
      if (signInResult === "not-allowed") showToast("That Google account is not allowed to use this tracker.", "error");
      if (signInResult === "cancelled") showToast("Sign-in was cancelled.", "error");
      renderVariety();
      fillProfileForm();
      setSyncStatus("disconnected", rememberedAccountId ? "Checking your sign-in…" : "Not signed in. Your progress is saved in this browser.");
      initAccount().then(() => {
        if (signInResult === "ok" && accountUser) showToast(`Signed in as ${accountUser.email}. Sync is on.`);
      });
    })();
