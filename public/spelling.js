(() => {
  const $s = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const now = () => new Date().toISOString();
  const makeId = () => globalThis.crypto?.randomUUID?.() || `spelling-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const intervals = [2, 5, 10, 21, 45, 90];
  let queue = [];
  let index = 0;
  let currentQuestion = null;
  let sessionStats = { right: 0, wrong: 0 };

  function state() {
    const value = window.fluencyTracker?.getState?.();
    if (!value) return null;
    value.spellingItems = Array.isArray(value.spellingItems) ? value.spellingItems : [];
    value.spellingProgress = value.spellingProgress && typeof value.spellingProgress === "object" ? value.spellingProgress : {};
    return value;
  }

  function persist() {
    window.fluencyTracker?.saveState?.();
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' -]/g, "").replace(/\s+/g, " ").trim();
  }

  function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  function shuffle(items) {
    return items.map(item => ({ item, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ item }) => item);
  }

  function spellingRecord(item) {
    const store = state();
    return store?.spellingProgress?.[item.id] || {};
  }

  function upsertSpellingMistake(input, save = true) {
    const store = state();
    if (!store) return false;
    const correct = String(input?.correct || "").trim();
    const original = String(input?.original || "").trim();
    if (!correct || normalize(correct) === normalize(original)) return false;
    let item = store.spellingItems.find(value => normalize(value.word) === normalize(correct));
    if (!item) {
      item = {
        id: makeId(), word: correct, meaning: String(input.meaning || "").trim(),
        example: String(input.example || input.evidence || "").trim(), source: String(input.source || "Practice review").trim(),
        misspellings: [], mistakeCount: 0, createdAt: now(), updatedAt: now()
      };
      store.spellingItems.push(item);
    }
    if (original && !item.misspellings.some(value => normalize(value) === normalize(original))) item.misspellings.push(original);
    if (input.meaning && !item.meaning) item.meaning = String(input.meaning).trim();
    if (input.example && !item.example) item.example = String(input.example).trim();
    if (input.increment !== false) item.mistakeCount = (Number(item.mistakeCount) || 0) + 1;
    item.updatedAt = now();
    const current = store.spellingProgress[item.id] || {};
    store.spellingProgress[item.id] = { ...current, dueAt: now(), lastResult: "wrong", correctStreak: 0, wrong: Number(current.wrong) || 0, updatedAt: now() };
    if (save) {
      persist();
      renderOverview();
    }
    return true;
  }

  function allCandidates() {
    const store = state();
    if (!store) return [];
    const mistakes = store.spellingItems.filter(item => item?.word).map(item => ({
      id: item.id, word: item.word, meaning: item.meaning || "", example: item.example || "", source: item.source || "Spelling mistake",
      explicitMistake: true, mistakeCount: Number(item.mistakeCount) || 1, misspellings: item.misspellings || []
    }));
    const seen = new Set(mistakes.map(item => normalize(item.word)));
    const vocabulary = store.library.filter(item => item?.type === "vocabulary" && item.front && item.back && !seen.has(normalize(item.front))).map(item => ({
      id: `library:${item.id}`, word: item.front, meaning: item.back, example: item.example || "", source: item.source || "Learning library",
      explicitMistake: (item.tags || []).some(tag => /mistake/i.test(tag)), mistakeCount: 0, misspellings: []
    }));
    return [...mistakes, ...vocabulary];
  }

  function due(item) {
    const record = spellingRecord(item);
    return !record.dueAt || new Date(record.dueAt) <= new Date();
  }

  function priority(item) {
    const record = spellingRecord(item);
    return (record.lastResult === "wrong" ? 110 : 0) + (item.explicitMistake ? 80 : 0) + Math.min(item.mistakeCount || 0, 5) * 18 + (due(item) ? 55 : 0) + (!record.seen ? 25 : 0) - (Number(record.correctStreak) || 0) * 7;
  }

  function filteredCandidates() {
    const scope = $s("#spellingScope")?.value || "due";
    const items = allCandidates();
    const selected = scope === "mistakes" ? items.filter(item => item.explicitMistake || spellingRecord(item).lastResult === "wrong") : scope === "all" ? items : items.filter(due);
    return selected.sort((a, b) => priority(b) - priority(a) || String(b.word).localeCompare(String(a.word)));
  }

  function availableModes(item) {
    const requested = $s("#spellingMode")?.value || "mixed";
    if (requested !== "mixed") return [requested];
    const modes = ["listen"];
    if (item.example && new RegExp(escapeRegExp(item.word), "i").test(item.example)) modes.push("blank");
    if (item.meaning && meaningOptions(item).length >= 4) modes.push("meaning");
    return modes;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function meaningOptions(item) {
    if (!item.meaning) return [];
    const distractors = shuffle([...new Set(allCandidates().map(value => String(value.meaning || "").trim()).filter(value => value && value !== item.meaning))]).slice(0, 3);
    return distractors.length === 3 ? shuffle([item.meaning, ...distractors]) : [];
  }

  function makeQuestion(item) {
    let mode = shuffle(availableModes(item))[0] || "listen";
    if (mode === "meaning" && meaningOptions(item).length < 4) mode = item.example ? "blank" : "listen";
    if (mode === "blank" && (!item.example || !new RegExp(escapeRegExp(item.word), "i").test(item.example))) mode = "listen";
    if (mode === "meaning") return { item, mode, options: meaningOptions(item), answer: item.meaning };
    if (mode === "blank") return { item, mode, sentence: item.example.replace(new RegExp(escapeRegExp(item.word), "i"), "_____"), answer: item.word };
    return { item, mode: "listen", answer: item.word };
  }

  function questionLabel(mode) {
    return mode === "meaning" ? "Choose the best meaning" : mode === "blank" ? "Complete the sentence" : "Hear it and type it";
  }

  function speakCurrent() {
    if (!currentQuestion || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.item.word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function renderQuestion() {
    const surface = $s("#spellingSurface");
    if (!surface) return;
    if (!queue.length || index >= queue.length) {
      const complete = sessionStats.right + sessionStats.wrong;
      surface.innerHTML = complete
        ? `<div class="dictation-card"><p class="dictation-kicker">Session complete</p><h3>${sessionStats.right} correct · ${sessionStats.wrong} to revisit</h3><p class="help">Missed words are due again now. Correct answers will return after a few days.</p><button class="btn primary" type="button" data-spelling-action="restart">Start another round</button></div>`
        : '<div class="empty">No matching words are ready. Choose “All vocabulary” or add vocabulary to your Learning Library.</div>';
      $s("#spellingStatus").textContent = complete ? "Round finished." : "Nothing is due right now.";
      currentQuestion = null;
      renderOverview();
      return;
    }
    currentQuestion = makeQuestion(queue[index]);
    const { item, mode } = currentQuestion;
    const oldSpelling = item.misspellings?.length ? `<p class="dictation-history">You previously wrote: <s>${escapeHtml(item.misspellings[item.misspellings.length - 1])}</s></p>` : "";
    if (mode === "meaning") {
      surface.innerHTML = `<div class="dictation-card"><p class="dictation-kicker">${questionLabel(mode)}</p><h3 class="dictation-word">${escapeHtml(item.word)}</h3>${oldSpelling}<div class="dictation-options">${currentQuestion.options.map((option, optionIndex) => `<button class="quiz-option" type="button" data-spelling-option="${optionIndex}">${escapeHtml(option)}</button>`).join("")}</div><div id="spellingFeedback" class="dictation-feedback" aria-live="polite"></div></div>`;
    } else if (mode === "blank") {
      surface.innerHTML = `<div class="dictation-card"><p class="dictation-kicker">${questionLabel(mode)}</p><h3 class="dictation-sentence">${escapeHtml(currentQuestion.sentence)}</h3>${oldSpelling}<label class="field dictation-answer"><span>Type the missing word or phrase</span><input id="spellingAnswer" type="text" autocomplete="off" spellcheck="false" /></label><div class="action-row"><button class="btn primary" type="button" data-spelling-action="check">Check answer</button></div><div id="spellingFeedback" class="dictation-feedback" aria-live="polite"></div></div>`;
      $s("#spellingAnswer")?.focus();
    } else {
      surface.innerHTML = `<div class="dictation-card"><p class="dictation-kicker">${questionLabel(mode)}</p><button class="listen-button" type="button" data-spelling-action="speak" aria-label="Play the word again">▶ <span>Play word</span></button>${oldSpelling}<label class="field dictation-answer"><span>Type exactly what you hear</span><input id="spellingAnswer" type="text" autocomplete="off" spellcheck="false" /></label><div class="action-row"><button class="btn primary" type="button" data-spelling-action="check">Check spelling</button></div><div id="spellingFeedback" class="dictation-feedback" aria-live="polite"></div></div>`;
      speakCurrent();
      $s("#spellingAnswer")?.focus();
    }
    $s("#spellingStatus").textContent = `Question ${index + 1} of ${queue.length} · ${sessionStats.right} correct · ${sessionStats.wrong} to revisit`;
  }

  function updateProgress(correct) {
    const store = state();
    const item = currentQuestion.item;
    const previous = store.spellingProgress[item.id] || {};
    const streak = correct ? (Number(previous.correctStreak) || 0) + 1 : 0;
    store.spellingProgress[item.id] = {
      ...previous, seen: (Number(previous.seen) || 0) + 1, right: (Number(previous.right) || 0) + (correct ? 1 : 0),
      wrong: (Number(previous.wrong) || 0) + (correct ? 0 : 1), correctStreak: streak,
      lastResult: correct ? "right" : "wrong", lastReviewedAt: now(), updatedAt: now(),
      dueAt: correct ? addDays(new Date(), intervals[Math.min(streak - 1, intervals.length - 1)]) : now()
    };
    if (!correct && item.id.startsWith("library:")) {
      const libraryId = item.id.slice("library:".length);
      const libraryItem = store.library.find(value => value.id === libraryId);
      if (libraryItem) {
        libraryItem.tags = [...new Set([...(libraryItem.tags || []), "spelling-mistake"])];
        libraryItem.updatedAt = now();
      }
    }
    correct ? sessionStats.right++ : sessionStats.wrong++;
    persist();
    renderOverview();
  }

  function showResult(correct, selected = "") {
    if (!currentQuestion) return;
    updateProgress(correct);
    const feedback = $s("#spellingFeedback");
    const item = currentQuestion.item;
    if (currentQuestion.mode === "meaning") {
      document.querySelectorAll("[data-spelling-option]").forEach(button => {
        const option = currentQuestion.options[Number(button.dataset.spellingOption)];
        button.disabled = true;
        button.classList.toggle("correct", option === currentQuestion.answer);
        button.classList.toggle("wrong", option === selected && !correct);
      });
    }
    feedback.className = `dictation-feedback ${correct ? "correct" : "wrong"}`;
    feedback.innerHTML = `<strong>${correct ? "Correct" : `Correct answer: ${escapeHtml(currentQuestion.answer)}`}</strong>${item.meaning ? `<span>${escapeHtml(item.meaning)}</span>` : ""}${item.example ? `<small>${escapeHtml(item.example)}</small>` : ""}<button class="btn" type="button" data-spelling-action="next">Next question</button>`;
    surfaceLock(true);
  }

  function surfaceLock(locked) {
    document.querySelectorAll("#spellingSurface input, #spellingSurface [data-spelling-action='check']").forEach(element => { element.disabled = locked; });
  }

  function checkTypedAnswer() {
    if (!currentQuestion) return;
    const input = $s("#spellingAnswer");
    if (!input || !input.value.trim()) {
      $s("#spellingFeedback").textContent = "Type an answer first.";
      return;
    }
    showResult(normalize(input.value) === normalize(currentQuestion.answer), input.value);
  }

  function startRound() {
    const candidates = filteredCandidates();
    const mistakeFirst = candidates.slice().sort((a, b) => priority(b) - priority(a));
    queue = mistakeFirst.slice(0, 12);
    index = 0;
    sessionStats = { right: 0, wrong: 0 };
    renderQuestion();
  }

  function nextQuestion() {
    index++;
    renderQuestion();
  }

  function renderOverview() {
    const items = allCandidates();
    const dueCount = items.filter(due).length;
    const trouble = items.filter(item => item.explicitMistake || spellingRecord(item).lastResult === "wrong").length;
    const strong = items.filter(item => (Number(spellingRecord(item).correctStreak) || 0) >= 3).length;
    const overview = $s("#spellingOverview");
    if (overview) overview.innerHTML = `<div><strong>${dueCount}</strong><small>due now</small></div><div><strong>${trouble}</strong><small>mistake words</small></div><div><strong>${strong}</strong><small>strong</small></div>`;
    const list = $s("#spellingTroubleList");
    if (list) {
      const difficult = items.filter(item => item.explicitMistake || spellingRecord(item).lastResult === "wrong").sort((a, b) => priority(b) - priority(a)).slice(0, 8);
      list.innerHTML = difficult.length ? difficult.map(item => `<div class="trouble-word"><strong>${escapeHtml(item.word)}</strong><small>${item.misspellings?.length ? `Previously: ${escapeHtml(item.misspellings[item.misspellings.length - 1])}` : "Needs another review"}</small></div>`).join("") : '<p class="help">Mistakes from Practice Zone and this quiz will appear here.</p>';
    }
  }

  function levenshtein(left, right) {
    const a = normalize(left);
    const b = normalize(right);
    const matrix = Array.from({ length: a.length + 1 }, (_, row) => [row]);
    for (let column = 0; column <= b.length; column++) matrix[0][column] = column;
    for (let row = 1; row <= a.length; row++) {
      for (let column = 1; column <= b.length; column++) {
        matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
      }
    }
    return matrix[a.length][b.length];
  }

  function recoverPastSpellingMistakes() {
    const store = state();
    if (!store) return;
    let changed = false;
    for (const session of store.practiceSessions || []) {
      const scoreValues = Object.values(session.review?.scores || {}).map(value => Number(value) || 0);
      if (scoreValues.some(Boolean) && scoreValues.every(value => value <= 10)) {
        session.review.scores = Object.fromEntries(Object.entries(session.review.scores).map(([key, value]) => [key, Math.min(100, (Number(value) || 0) * 10)]));
        changed = true;
      }
      if (session.spellingRecoveryAppliedAt || !session.review) continue;
      for (const correction of session.review.priority_corrections || []) {
        const originalWords = String(correction.original || "").match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];
        const correctedWords = String(correction.corrected || "").match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];
        for (const original of originalWords) {
          if (correctedWords.some(value => normalize(value) === normalize(original))) continue;
          const match = correctedWords.map(value => ({ value, distance: levenshtein(original, value) })).filter(value => value.distance > 0 && value.distance <= 2 && value.value[0]?.toLowerCase() === original[0]?.toLowerCase()).sort((a, b) => a.distance - b.distance)[0];
          if (!match) continue;
          changed = upsertSpellingMistake({ original, correct: match.value, example: correction.corrected, evidence: correction.original, source: `Recovered from Practice Zone · ${session.date || "previous session"}`, increment: false }, false) || changed;
        }
      }
      session.spellingRecoveryAppliedAt = now();
      changed = true;
    }
    if (changed) persist();
  }

  window.fluencyTracker.addSpellingMistake = input => upsertSpellingMistake(input, true);
  window.fluencyTracker.refreshSpelling = renderOverview;

  $s("#startSpellingBtn")?.addEventListener("click", startRound);
  $s("#spellingScope")?.addEventListener("change", renderOverview);
  $s("#spellingSurface")?.addEventListener("click", event => {
    const option = event.target.closest("[data-spelling-option]");
    if (option && currentQuestion) {
      const selected = currentQuestion.options[Number(option.dataset.spellingOption)];
      return showResult(selected === currentQuestion.answer, selected);
    }
    const action = event.target.closest("[data-spelling-action]")?.dataset.spellingAction;
    if (action === "check") checkTypedAnswer();
    else if (action === "next") nextQuestion();
    else if (action === "speak") speakCurrent();
    else if (action === "restart") startRound();
  });
  $s("#spellingSurface")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.id === "spellingAnswer" && !event.target.disabled) checkTypedAnswer();
  });

  recoverPastSpellingMistakes();
  renderOverview();
  window.addEventListener("fluency-state-updated", renderOverview);
})();
