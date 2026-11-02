// Prompts and answer handling for the Home and Other (stored as "Custom") categories.
// Vehicles keep their own fixed-list flow in add_iteams.controller.js.

import { systemLabel } from "./home.systems.js";

export const MAX_QUESTION_ROUNDS = 3;

const INPUT_TYPES = ["single_choice", "multi_choice", "yes_no", "numeric", "text"];
const NOT_SURE = "Not sure";

const val = (v, fallback = "Not available") =>
  v === null || v === undefined || v === "" ? fallback : v;

const formatDate = (d) => (d ? new Date(d).toISOString().split("T")[0] : "Not available");

const describeItem = (item) => {
  if (item.category === "Home") {
    return `Property name: ${val(item.name)}
Property type: ${val(item.property_type)}
Year built: ${val(item.year_of_the_model)}
ZIP code: ${val(item.zip_code)}
Own or rent: ${val(item.own_or_rent)}
Systems/features present: ${item.systems?.length ? item.systems.map(systemLabel).join(", ") : "None selected"}
User notes: ${val(item.user_notes, "None")}`;
  }

  return `Name: ${val(item.name)}
Group: ${val(item.group)}
Description: ${val(item.description)}
Due date: ${formatDate(item.due_date)}
Repeat: ${val(item.repeat)}
Reminder: ${val(item.reminder)}
User notes: ${val(item.user_notes, "None")}`;
};

const describeAnswers = (answered) =>
  answered.length === 0
    ? "None yet."
    : answered
        .map((q) => {
          const a = q.skipped
            ? "(skipped)"
            : Array.isArray(q.answer)
              ? q.answer.join(", ")
              : String(q.answer);
          return `- [${q.itemKey}] ${q.question} -> ${a}`;
        })
        .join("\n");

const QUESTION_JSON_FORMAT = `{
  "needs_more_information": true,
  "classification": "physical_asset",
  "questions": [
    {
      "question_id": "septic_last_pumped",
      "question_text": "When was the septic tank last pumped?",
      "input_type": "single_choice",
      "options": ["Within 1 year", "1-3 years ago", "3-5 years ago", "Over 5 years ago", "Not sure"],
      "optional": false,
      "reason": "Pumping frequency depends on how long ago the tank was serviced.",
      "maintenance_impact": "Sets the next septic pumping date."
    }
  ]
}`;

const SHARED_QUESTION_RULES = `- Use all asset details and prior answers as context. Never repeat an answered question.
- Ask only questions whose answers can materially change maintenance tasks, intervals, or reminders.
- Return the minimum useful questions. Do not fill a quota. Fewer is better than filler.
- Prefer single_choice, multi_choice, yes_no and numeric answers. Use text only when needed.
- input_type must be one of: single_choice, multi_choice, yes_no, numeric, text.
- Include "Not sure" in options where appropriate. Mark non-essential questions optional: true.
- question_id must be lowercase snake_case, describe the topic, and be stable.
- Do not invent installed equipment, specifications, manufacturer guidance, or service history.
- Do NOT generate maintenance tasks or a schedule yet.
- Set needs_more_information to false and return an empty questions array once a practical
  schedule could be built from what is already known.
- Return ONLY valid JSON. No markdown. No text outside the JSON.`;

export const buildQuestionPrompt = (item, answered, round) => {
  const isHome = item.category === "Home";

  const role = isHome
    ? `You are the preventative maintenance question advisor for Maintenance Genie.
Analyze the user's property details and selected systems, then return only high-value
follow-up questions needed to personalize a future home maintenance schedule.`
    : `You are the preventative maintenance question advisor for Maintenance Genie.
First classify the user's entry as "physical_asset", "recurring_task" or "one_time_task".
Then return only questions needed to establish appropriate maintenance or scheduling
requirements.`;

  const guidance = isHome
    ? `Ask about identified systems and relevant property conditions only. Consider system
configuration, equipment age/type, fuel source, usage, service history and environmental
conditions. Avoid obscure technical questions.
Examples of conditional topics:
- HVAC/heat pump: ducted vs ductless, filter arrangement, backup heating.
- Private well: filtration/treatment, pressure tank, relevant testing history.
- Septic: last inspection or pumping and household occupancy.
- Wood stove/fireplace: fuel type and frequency of use.
- Pool/hot tub: equipment and sanitation configuration.`
    : `Match questions to the classification:
- physical_asset: equipment type, make/model, power or fuel, usage, operating hours/meter,
  environment, service history, replaceable components, storage/winterization.
- recurring_task: activity, preferred or recommended frequency, seasonal factors, last
  completion, reminder preference.
- one_time_task: desired due date, priority, notes and reminders. Do not invent recurring
  intervals.
Examples: Air compressor -> oil-free vs lubricated, frequency of use, hour meter.
Clean gutters -> overhanging trees, last cleaning, seasonal reminders.
Repaint mailbox -> due date and reminder only.`;

  const count = round === 1 ? (isHome ? "about 5-8" : "about 3-6") : "at most 4";

  return `
${role}

This is question round ${round} of at most ${MAX_QUESTION_ROUNDS}. Return ${count} questions, or fewer
(including none) if enough is already known. Ask additional questions only if earlier
answers revealed a maintenance-relevant detail.

──────────────────────────────
ASSET DETAILS
──────────────────────────────
Category: ${isHome ? "Home" : "Other"}
${describeItem(item)}

──────────────────────────────
PREVIOUS ANSWERS
──────────────────────────────
${describeAnswers(answered)}

──────────────────────────────
GUIDANCE
──────────────────────────────
${guidance}

──────────────────────────────
RULES
──────────────────────────────
${SHARED_QUESTION_RULES}

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
${QUESTION_JSON_FORMAT}
`.trim();
};

// Validates and cleans the AI's question list. Drops malformed entries and any
// question_id that already exists for this item.
export const normalizeQuestions = (list, existingKeys, limit) => {
  const seen = new Set(existingKeys);
  const out = [];

  for (const q of Array.isArray(list) ? list : []) {
    const id = String(q?.question_id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const text = String(q?.question_text || "").trim();
    if (!id || !text || seen.has(id)) continue;

    let inputType = INPUT_TYPES.includes(q.input_type) ? q.input_type : "text";
    let options = Array.isArray(q.options)
      ? q.options.map((o) => String(o).trim()).filter(Boolean)
      : [];

    if (inputType === "yes_no") {
      options = ["Yes", "No", NOT_SURE];
    } else if (inputType === "single_choice" || inputType === "multi_choice") {
      if (options.length < 2) {
        inputType = "text";
        options = [];
      }
    } else {
      options = [];
    }

    seen.add(id);
    out.push({
      itemKey: id,
      question: text,
      input_type: inputType,
      options,
      optional: q.optional === true,
      reason: String(q.reason || "").trim() || null,
      maintenance_impact: String(q.maintenance_impact || "").trim() || null,
    });

    if (out.length >= limit) break;
  }

  return out;
};

// Checks one submitted answer against its question. Returns { value } or { error }.
export const validateAnswer = (question, raw) => {
  const label = question.itemKey;
  const isNotSure = (v) => typeof v === "string" && v.trim().toLowerCase() === "not sure";

  if (isNotSure(raw)) return { value: NOT_SURE };

  switch (question.input_type) {
    case "yes_no": {
      const v = String(raw).trim().toLowerCase();
      if (v === "yes") return { value: "Yes" };
      if (v === "no") return { value: "No" };
      return { error: `${label}: answer must be Yes, No or Not sure` };
    }
    case "single_choice": {
      const match = (question.options || []).find(
        (o) => String(o).toLowerCase() === String(raw).trim().toLowerCase(),
      );
      return match ? { value: match } : { error: `${label}: answer must be one of the options` };
    }
    case "multi_choice": {
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.length === 0) return { error: `${label}: select at least one option` };
      const picked = [];
      for (const a of arr) {
        const match = (question.options || []).find(
          (o) => String(o).toLowerCase() === String(a).trim().toLowerCase(),
        );
        if (!match) return { error: `${label}: "${a}" is not a valid option` };
        picked.push(match);
      }
      return { value: picked };
    }
    case "numeric": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      return Number.isFinite(n) && String(raw).trim() !== ""
        ? { value: n }
        : { error: `${label}: answer must be a number` };
    }
    default: {
      const t = String(raw ?? "").trim();
      return t ? { value: t } : { error: `${label}: answer cannot be empty` };
    }
  }
};

const TASK_JSON_FORMAT = `{
  "schedule_summary": "",
  "maintenance_items": [
    {
      "task": "",
      "category": "",
      "recommended_interval": "",
      "last_service_assumption": "",
      "next_due_mileage": "N/A",
      "next_due_date": "",
      "status": "",
      "priority": "",
      "manufacturer_interval_uncertain": true,
      "notes": ""
    }
  ]
}`;

export const buildTaskPrompt = (item, answered) => {
  const isHome = item.category === "Home";
  const today = new Date().toISOString().split("T")[0];

  const goal = isHome
    ? `Create a practical preventative home maintenance schedule for this property. Cover
only the systems the user selected, adjusted by their answers (equipment type, fuel,
usage, service history, environment). Include seasonal items where they apply to the ZIP
code or region. Do not add tasks for systems the user does not have.`
    : `Create the maintenance or scheduling entries for this item based on its type:
- one-time task: return exactly ONE task using the user's due date. Do not invent a
  recurring interval.
- recurring task: return one task with the requested or recommended frequency and the
  next due date.
- physical asset: return the routine maintenance tasks for that equipment, adjusted by
  usage, environment and the answers given.`;

  return `
You are Maintenance Genie, a preventative maintenance schedule generator.

${goal}

Current date: ${today}

──────────────────────────────
ASSET DETAILS
──────────────────────────────
Category: ${isHome ? "Home" : "Other"}
${describeItem(item)}

──────────────────────────────
USER ANSWERS
──────────────────────────────
${describeAnswers(answered)}

Treat "Not sure", skipped and missing answers as unknown. Use conservative defaults for
unknowns and set "manufacturer_interval_uncertain" to true for them.

──────────────────────────────
RULES
──────────────────────────────
- Return valid JSON only. No markdown. No text outside the JSON.
- Do not invent installed equipment, specifications or service history.
- Each task name must be unique.
- "status" must be one of: Due Now, Upcoming, Future, Overdue.
- "priority" must be one of: High, Medium, Low.
- "next_due_date" must be a YYYY-MM-DD date, or "Unknown" if it cannot be estimated.
- "next_due_mileage" is "N/A" for non-vehicle items.
- Use plain language. Recommend verifying specifics with the owner's manual or a
  qualified professional where relevant.

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
${TASK_JSON_FORMAT}
`.trim();
};
