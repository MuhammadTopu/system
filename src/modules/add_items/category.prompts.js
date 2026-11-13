// Prompts and answer handling for the Home and Other (stored as "Custom") categories.
// Vehicles keep their own fixed-list flow in add_iteams.controller.js.

import { systemLabel } from "./home.systems.js";

export const MAX_QUESTION_ROUNDS = 3;

const INPUT_TYPES = ["single_choice", "multi_choice", "yes_no", "numeric", "text"];
const NOT_SURE = "Not sure";

const val = (v, fallback = "Not available") =>
  v === null || v === undefined || v === "" ? fallback : v;

const formatDate = (d) => (d ? new Date(d).toISOString().split("T")[0] : "Not available");

export const describeItem = (item) => {
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
Sub-category: ${val(item.sub_category)}
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

// Service intervals for a Home or Other item, one "Name - interval" line each.
export const buildServiceIntervalPrompt = (item, maxItems) => {
  const isHome = item.category === "Home";

  const scope = isHome
    ? `Cover the systems and features the user selected, adjusted for the property type and
age. If no systems were selected, give general home maintenance intervals. Do not add
items for systems the user does not have.`
    : `If the entry is a physical asset or piece of equipment, give its routine maintenance
intervals. If it is a recurring task, give the recommended frequency. If it is a
one-time task with no maintenance, return exactly one line:
1. One-time task - no recurring interval`;

  return `
Generate a recommended service interval list for the following ${isHome ? "property" : "item"}.

${describeItem(item)}

${scope}
Make intervals specific to the details above where possible.

FORMAT RULES:
- Return a numbered list only.
- One service item per line, in exactly this format:
  1. Service Name - interval
- Maximum ${maxItems} items.
- No markdown, no bold, no asterisks, no bullet characters.
- No blank lines.
- No introduction sentence and no closing sentence.
`.trim();
};

// Community-derived recommendations for a Home or Other item. Same JSON shape as
// the vehicle forum suggestions, so the app can show them the same way.
// Other items are anything (a gadget, a pet, a subscription, a one-time job), so
// "owner consensus that differs from the manufacturer" often does not exist. For
// Other the AI always gives 3 to 5 practical, commonly shared tips instead of an
// empty list. Honesty rules stay: no made-up links, "Low" confidence is allowed.
const buildOtherForumPrompt = (item) =>
  `
You are Maintenance Genie, a preventative maintenance assistant.

Give practical maintenance tips and recommended intervals that people and owner communities
commonly share for the item below. Where a tip differs from the standard or manufacturer
schedule, say so. Where there is no standard schedule, give the commonly recommended one.

──────────────────────────────
ITEM
──────────────────────────────
${describeItem(item)}

──────────────────────────────
RULES
──────────────────────────────
1. ALWAYS return between 3 and 5 items. Never return an empty array.
2. Make every item specific to this kind of item or task (use the group, sub-category and
   description above). If it is a one-time task, give the practical tips people commonly share
   for doing it well and on time (for example preparation, reminders, what to keep, when to
   follow up), and use "One-time" or "Before the due date" as the interval.
3. Never invent a failure mode, statistic or interval you do not believe is commonly
   recommended. Use "confidence": "Low" when you are less sure. "Low" is fine.
4. The "reason" must say concretely what goes wrong or what is gained. No vague phrases
   like "improves longevity".
5. "manufacturer_interval" may be "Not specified" when there is no standard schedule.
6. "source_forum": use a real, well known community name only when you are confident it
   exists for this topic (for example "Reddit r/HomeImprovement"). Otherwise use
   "Owner communities".
7. "source_url" must be an empty string. Never fabricate a URL, thread title or link.
8. "confidence" must be "High", "Medium" or "Low".
9. Use plain language an average person will understand.
10. Return ONLY valid JSON. No markdown. No text outside the JSON.

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
{
  "forum_suggestions": [
    {
      "maintenance_item": "Battery Check",
      "category": "Battery",
      "manufacturer_interval": "Not specified",
      "forum_recommended_interval": "Every 6 months",
      "reason": "Owners report corroded or swollen batteries that damage the device when they are left unchecked.",
      "applies_to": "Devices that use removable batteries",
      "confidence": "Medium",
      "source_forum": "Owner communities",
      "source_url": ""
    }
  ]
}
`.trim();

export const buildForumPrompt = (item) => {
  const isHome = item.category === "Home";
  if (!isHome) return buildOtherForumPrompt(item);

  return `
You are Maintenance Genie, a preventative maintenance assistant.

Your task is NOT to list forums. Your task is to report maintenance recommendations that
${isHome ? "homeowner" : "owner"} communities have arrived at for the ${isHome ? "systems of this property" : "item below"}, where
those recommendations DIFFER from the standard or manufacturer schedule.

──────────────────────────────
${isHome ? "PROPERTY" : "ITEM"}
──────────────────────────────
${describeItem(item)}

──────────────────────────────
RULES
──────────────────────────────
1. Return between 0 and 5 recommendations. Quality matters far more than quantity.
2. ${isHome ? "Only cover the systems the user selected." : "Only cover this specific kind of equipment. If the entry is a one-time task, return an empty array."}
3. Never invent a failure mode or an interval. Only report consensus you are confident is
   real and commonly discussed.
4. Generic advice such as "maintain it regularly" is NOT a finding. Only include an item
   when owners report a real problem that the standard interval failed to prevent.
5. The "reason" must name the concrete symptom or failure owners report. Do not use vague
   benefits like "improves longevity".
6. "source_forum" is REQUIRED. Use a real, well known community name (for example
   "Reddit r/HomeImprovement", "DIY Chatroom"). If you cannot confidently name one, use
   "Owner communities".
7. "source_url" must be an empty string unless you are certain of a real URL. Never
   fabricate a URL, thread title or link.
8. "confidence" must be "High", "Medium" or "Low".
9. Return an empty array if there is no known community recommendation that meets this
   bar. An empty array is an acceptable answer. Never pad.
10. Use plain language an average owner will understand.
11. Return ONLY valid JSON. No markdown. No text outside the JSON.

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
{
  "forum_suggestions": [
    {
      "maintenance_item": "Septic Tank Pumping",
      "category": "Septic",
      "manufacturer_interval": "Every 3-5 years",
      "forum_recommended_interval": "Every 2-3 years",
      "reason": "Owners with garbage disposals report slow drains and drain field backups when pumping is delayed.",
      "applies_to": "Households with a garbage disposal",
      "confidence": "Medium",
      "source_forum": "Owner communities",
      "source_url": ""
    }
  ]
}
`.trim();
};

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
