// English Fluency Tracker — shared prompts and response schemas.
// Copyright (c) 2026 Kiyan Amirian. Licensed under the MIT License.
//
// Used by the server (connected AI providers) and by the browser (copy-and-paste mode),
// so both paths coach the learner the same way.

export const DEFAULT_VARIETY = "American English";
export const ENGLISH_VARIETIES = ["American English", "British English", "Canadian English", "Australian English", "International English"];
export const PRACTICE_MODES = ["conversation", "small_talk", "friend_chat", "roleplay", "short_writing", "grammar", "collocation"];
const LIBRARY_TYPES = ["grammar", "collocation", "phrasal_verb", "vocabulary"];

const clip = (value, limit) => String(value ?? "").slice(0, limit);
const oneLine = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

export function cleanLearner(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    name: oneLine(value.name, 60),
    level: oneLine(value.level, 120) || "advanced (about C1)",
    variety: ENGLISH_VARIETIES.includes(value.variety) ? value.variety : DEFAULT_VARIETY,
    nativeLanguage: oneLine(value.nativeLanguage, 60),
    goals: oneLine(value.goals, 400)
  };
}

export function learnerSummary(raw) {
  const learner = cleanLearner(raw);
  return [
    `Learner: ${learner.name || "not named"}.`,
    `Level: ${learner.level}.`,
    `Target: natural, educated ${learner.variety}.`,
    learner.nativeLanguage ? `First language: ${learner.nativeLanguage}.` : "",
    learner.goals ? `Goals: ${learner.goals}` : ""
  ].filter(Boolean).join(" ");
}

export function cleanSession(raw) {
  const session = raw && typeof raw === "object" ? raw : {};
  const target = item => ({ id: clip(item?.id, 100), type: clip(item?.type, 30), front: clip(item?.front, 250), back: clip(item?.back, 800), example: clip(item?.example, 500) });
  return {
    id: clip(session.id, 100),
    mode: PRACTICE_MODES.includes(session.mode) ? session.mode : "conversation",
    topic: clip(session.topic, 80),
    customTopic: clip(session.customTopic, 500),
    feedback: session.feedback === "coach" ? "coach" : "end",
    maxTurns: Math.max(1, Math.min(14, Number(session.maxTurns) || 10)),
    targetMode: ["manual", "smart", "random"].includes(session.targetMode) ? session.targetMode : "manual",
    targetCount: Math.max(1, Math.min(5, Number(session.targetCount) || 4)),
    targets: Array.isArray(session.targets) ? session.targets.slice(0, 5).map(target) : [],
    targetCandidates: Array.isArray(session.targetCandidates) ? session.targetCandidates.slice(0, 20).map(item => ({ ...target(item), tags: Array.isArray(item?.tags) ? item.tags.slice(0, 8).map(tag => clip(tag, 60)) : [] })) : [],
    messages: Array.isArray(session.messages) ? session.messages.slice(-30).map(message => ({ role: message?.role === "assistant" ? "assistant" : message?.role === "system" ? "system" : "user", content: clip(message?.content, 5000) })).filter(message => message.content) : [],
    learner: cleanLearner(session.learner)
  };
}

function targetList(session) {
  return session.targets.length
    ? session.targets.map((item, index) => `${index + 1}. [${item.id}] ${item.front} (${item.type}): ${item.back}${item.example ? ` Example: ${item.example}` : ""}`).join("\n")
    : "No required targets.";
}

function modeGuidance(session) {
  const variety = session.learner.variety;
  return {
    small_talk: `SMALL-TALK MODE: Simulate a brief, realistic conversation with a stranger in a safe everyday public setting such as a shop, cafe line, dog walk, neighborhood event, elevator, or waiting area. Rotate settings across sessions unless the learner specifies one. On the first turn, give only the situation and a subtle social cue, then let the learner make the opening move; do not write the learner's opener for them. Help them practice this sequence naturally: a situation-based opener, one easy follow-up, a small relevant self-disclosure, and a graceful exit. Respond like a real stranger: friendly but not instantly intimate, and occasionally brief so the learner practices reading conversational interest. Reward warmth, appropriateness, clarity, follow-up questions, and ending without awkwardness. Never encourage oversharing, pressure, sensitive personal questions, or unsafe interaction.`,
    friend_chat: `CASUAL FRIEND-CHAT MODE: Simulate an informal text conversation with a friend who writes natural ${variety}. Use natural short messages, contractions, fragments, tone softeners, and occasional emoji. Use only current, widely understood texting abbreviations—for example idk, ik, tbh, ngl, rn, btw, lol, or lmao—and normally use no more than one or two in a message. Never force slang, flood the exchange with abbreviations, or use offensive, sexual, highly niche, or identity-coded slang. Make meanings inferable from context and sometimes invite the learner to try one. Judge whether the learner's abbreviation fits the tone and context. Keep this clearly in texting register; do not imply that every abbreviation belongs in spoken or professional English.`
  }[session.mode] || "";
}

function sharedCoachText(session, smartSelection = "") {
  const variety = session.learner.variety;
  const guidance = modeGuidance(session);
  return `You are a warm, concise ${variety} coach. ${learnerSummary(session.learner)} Favor natural, everyday expressions over obscure vocabulary. Prioritize collocations, phrasal verbs, register, pragmatics, rhythm, and accurate grammar.\n\nPractice mode: ${session.mode}\nTopic category: ${session.topic || "surprise me"}\nCustom topic: ${session.customTopic || "none"}\nFeedback timing: ${session.feedback}\nMaximum learner replies: ${session.maxTurns}\nTarget selection mode: ${session.targetMode}\nLearning targets:\n${targetList(session)}${smartSelection}${guidance ? `\n\n${guidance}` : ""}`;
}

function evaluationRules(session) {
  const variety = session.learner.variety;
  const modeEvaluation = session.mode === "small_talk"
    ? " Pay special attention to whether the learner opened appropriately, showed interest without overstepping, responded to social cues, and could end the exchange naturally. In next_focus, give one small, safe real-world challenge the learner could try aloud."
    : session.mode === "friend_chat"
      ? " Pay special attention to texting register, brevity, tone, and whether abbreviations were natural and appropriate. Explicitly correct any awkward or overused abbreviation and give its plain-English meaning."
      : "";
  return `Every score must be an integer on a 0–100 scale, where 80 means strong but still noticeably improvable—not 8 out of 10. A target earns credit only when the learner used it naturally; do not credit the coach's own use. Judge usage specifically for natural, contemporary ${variety} and identify understandable-but-awkward wording instead of praising it as fully natural. Preserve the learner's intended meaning when suggesting a replacement. Do not create a learnable merely because a target was not used. Propose at most five reusable learnables, and only for meaningful recurring or high-value mistakes. Put genuine spelling errors in spelling_mistakes separately from grammar and style corrections; include the correct spelling, a short meaning, and a natural example. Do not invent mistakes.${modeEvaluation}`;
}

function turnRules(session) {
  return `Conduct one natural turn at a time. Ask interesting, specific follow-up questions and gently create opportunities to use the targets without giving away an exact sentence. Keep each reply under 110 words. If feedback timing is "end", do not correct the learner during the conversation unless meaning is unclear. If it is "coach", give at most one brief correction per turn and keep the conversation moving. Do not claim to assess pronunciation from text.`;
}

export function practiceInstructions(action, rawSession) {
  const session = cleanSession(rawSession);
  const candidateText = session.targetCandidates.length
    ? session.targetCandidates.map((item, index) => `${index + 1}. [${item.id}] ${item.front} (${item.type}): ${item.back}${item.tags.length ? ` Tags: ${item.tags.join(", ")}` : ""}`).join("\n")
    : "No candidate list.";
  const smartSelection = action === "start" && session.targetMode === "smart"
    ? `\n\nChoose up to ${Math.min(session.targetCount, session.targetCandidates.length)} target IDs from the candidate list below. Choose items that can be used naturally together in this specific conversation, while preferring useful variety across grammar, collocations, phrasal verbs, and vocabulary. Skip any expression that is unnatural, dated, regionally marked outside mainstream ${session.learner.variety}, or a poor fit for the topic; choosing fewer good targets is better than forcing a weak one. The candidates are already ranked for due or difficult items. Build the opening around the chosen combination without giving the learner exact answers.\nCandidate targets:\n${candidateText}`
    : action === "start" ? "\n\nReturn the IDs of the supplied learning targets in selected_target_ids." : "";
  const shared = sharedCoachText(session, smartSelection);
  if (action === "evaluate") return `${shared}\n\nEvaluate only the supplied transcript. ${evaluationRules(session)}`;
  const correctionRule = session.feedback === "end" ? " Return empty strings for brief_correction unless meaning is unclear." : "";
  return `${shared}\n\n${turnRules(session)}${correctionRule}`;
}

function openingTask(session) {
  return session.mode === "small_talk"
    ? "Start with a concise public-setting scenario and a subtle cue from the stranger. Stop before speaking for the learner, so the learner must initiate the conversation."
    : session.mode === "friend_chat"
      ? "Start with one natural, friendly text message that establishes context and uses at most one common texting abbreviation."
      : "Start the practice now with an engaging opening question, prompt, or role-play setup.";
}

function transcriptText(session) {
  const labels = { user: "LEARNER", assistant: "COACH", system: "NOTE" };
  return session.messages.map(message => `${labels[message.role] || "LEARNER"}: ${message.content}`).join("\n\n");
}

export function practiceTask(action, rawSession) {
  const session = cleanSession(rawSession);
  if (action === "evaluate") return `Evaluate this completed practice transcript.\n\n${transcriptText(session)}`;
  if (action === "start") return openingTask(session);
  return `Continue after the learner's latest message. The full transcript is below.\n\n${transcriptText(session)}`;
}

export function reviewJsonExample(sessionId, includeTranscript = false) {
  const example = {
    practice_review_version: 1,
    session_id: sessionId,
    scores: { naturalness: 0, grammar_accuracy: 0, vocabulary_range: 0, task_completion: 0, target_usage: 0, overall: 0 },
    summary: "brief overall feedback",
    strengths: ["specific strength"],
    priority_corrections: [{ original: "learner wording", corrected: "natural correction", explanation: "brief reason" }],
    spelling_mistakes: [{ original: "misspelling", correct: "correct spelling", meaning: "short meaning", example: "natural sentence", evidence: "learner sentence" }],
    target_results: [{ target_id: "library item id or empty", target: "target expression", status: "used_naturally|needs_correction|not_used", evidence: "learner wording or empty", feedback: "brief feedback" }],
    proposed_items: [{ type: "grammar|collocation|phrasal_verb|vocabulary", front: "reusable point", back: "meaning or rule", example: "natural example", reason: "why this is useful" }],
    next_focus: "one practical next step"
  };
  if (includeTranscript) example.transcript = [{ role: "coach", content: "your exact message" }, { role: "learner", content: "my exact message" }];
  return JSON.stringify(example, null, 2);
}

// Copy-and-paste mode: the whole conversation happens in the learner's own AI chat,
// which ends by returning one JSON object the tracker can import.
export function manualPracticePrompt(rawSession) {
  const session = cleanSession(rawSession);
  return [
    "Let's run an English practice session in this chat. You are my coach. Read all of these instructions before you start.",
    "",
    sharedCoachText(session),
    "",
    "How to run the session:",
    `- ${turnRules(session)}`,
    `- The session ends after my ${session.maxTurns}th reply, or earlier if I write FINISH.`,
    "- When it ends, reply with ONLY one JSON object—no Markdown, no code fences, and no other text—so I can paste it into my tracker.",
    "- Include the complete conversation in transcript, word for word, in order.",
    "",
    "How to score the session:",
    evaluationRules(session),
    "",
    "Final JSON shape (replace the example values):",
    reviewJsonExample(session.id, true),
    "",
    `Now begin. ${openingTask(session)}`
  ].join("\n");
}

export function reviewSystemPrompt(task, rawLearner) {
  const learner = cleanLearner(rawLearner);
  const focus = { library_review: "learning-library examples", writing_review: "writing", activity_review: "practice sessions" }[task] || "English practice";
  return `You are a precise, encouraging ${learner.variety} coach reviewing ${focus}. ${learnerSummary(learner)} Follow the user's instructions exactly. Return only the JSON object they describe, with no Markdown and no commentary.`;
}

// ---------- JSON schemas ----------

const str = { type: "string" };
const itemSchema = (extra = {}) => ({
  type: "object", additionalProperties: false,
  required: ["type", "front", "back", "example", ...Object.keys(extra)],
  properties: { type: { type: "string", enum: LIBRARY_TYPES }, front: str, back: str, example: str, ...extra }
});

export const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "brief_correction", "target_observations", "should_end"],
  properties: {
    reply: str,
    brief_correction: { type: "object", additionalProperties: false, required: ["original", "better", "reason"], properties: { original: str, better: str, reason: str } },
    target_observations: {
      type: "array", maxItems: 5,
      items: { type: "object", additionalProperties: false, required: ["target_id", "status", "note"], properties: { target_id: str, status: { type: "string", enum: ["used_naturally", "needs_correction", "not_yet"] }, note: str } }
    },
    should_end: { type: "boolean" }
  }
};

export const startSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "selected_target_ids"],
  properties: { reply: str, selected_target_ids: { type: "array", maxItems: 5, items: str } }
};

const scoreKeys = ["naturalness", "grammar_accuracy", "vocabulary_range", "task_completion", "target_usage", "overall"];
export const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "summary", "strengths", "priority_corrections", "spelling_mistakes", "target_results", "proposed_items", "next_focus"],
  properties: {
    scores: { type: "object", additionalProperties: false, required: scoreKeys, properties: Object.fromEntries(scoreKeys.map(key => [key, { type: "number", minimum: 0, maximum: 100 }])) },
    summary: str,
    strengths: { type: "array", maxItems: 4, items: str },
    priority_corrections: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["original", "corrected", "explanation"], properties: { original: str, corrected: str, explanation: str } } },
    spelling_mistakes: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["original", "correct", "meaning", "example", "evidence"], properties: { original: str, correct: str, meaning: str, example: str, evidence: str } } },
    target_results: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["target_id", "target", "status", "evidence", "feedback"], properties: { target_id: str, target: str, status: { type: "string", enum: ["used_naturally", "needs_correction", "not_used"] }, evidence: str, feedback: str } } },
    proposed_items: { type: "array", maxItems: 5, items: itemSchema({ reason: str }) },
    next_focus: str
  }
};

export const libraryReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["review_version", "reviews"],
  properties: {
    review_version: { type: "integer", enum: [1] },
    reviews: {
      type: "array", maxItems: 50,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "verdict", "corrected_example", "explanation", "new_items"],
        properties: { id: str, verdict: { type: "string", enum: ["correct", "minor", "major"] }, corrected_example: str, explanation: str, new_items: { type: "array", maxItems: 2, items: itemSchema() } }
      }
    }
  }
};

export const writingReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["writing_review_version", "date", "corrected_text", "overall_feedback", "key_corrections", "target_results", "reusable_items"],
  properties: {
    writing_review_version: { type: "integer", enum: [1] },
    date: str,
    corrected_text: str,
    overall_feedback: str,
    key_corrections: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["category", "original", "corrected", "explanation"], properties: { category: str, original: str, corrected: str, explanation: str } } },
    target_results: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["target", "status", "evidence", "feedback"], properties: { target: str, status: { type: "string", enum: ["used_naturally", "needs_correction", "not_used"] }, evidence: str, feedback: str } } },
    reusable_items: { type: "array", maxItems: 3, items: itemSchema() }
  }
};

export const activityReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["activity_review_version", "session_id", "overall_feedback", "corrected_evidence", "understanding_notes", "phrase_corrections", "pronunciation_notes", "reusable_items"],
  properties: {
    activity_review_version: { type: "integer", enum: [1] },
    session_id: str,
    overall_feedback: str,
    corrected_evidence: str,
    understanding_notes: str,
    phrase_corrections: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["original", "corrected", "explanation"], properties: { original: str, corrected: str, explanation: str } } },
    pronunciation_notes: str,
    reusable_items: { type: "array", maxItems: 3, items: itemSchema() }
  }
};

// maxTokens leaves room for models that reason before answering.
export const AI_TASKS = {
  practice_start: { schema: startSchema, name: "practice_start", maxTokens: 4000 },
  practice_reply: { schema: replySchema, name: "practice_reply", maxTokens: 4000 },
  practice_evaluate: { schema: evaluationSchema, name: "practice_evaluation", maxTokens: 8000 },
  library_review: { schema: libraryReviewSchema, name: "library_review", maxTokens: 8000 },
  writing_review: { schema: writingReviewSchema, name: "writing_review", maxTokens: 8000 },
  activity_review: { schema: activityReviewSchema, name: "activity_review", maxTokens: 6000 }
};

if (typeof globalThis !== "undefined" && typeof globalThis.document !== "undefined") {
  globalThis.FluencyPrompts = { DEFAULT_VARIETY, ENGLISH_VARIETIES, cleanLearner, cleanSession, learnerSummary, manualPracticePrompt, reviewJsonExample };
}
