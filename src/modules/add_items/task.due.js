// AI returns next_due_date as text. The reminder cron needs a real timestamp, so
// only ISO style values are accepted ("2026-12-01" or "2026-12-01T09:00:00Z");
// anything else ("Unknown", "March 2027") gives null and no reminder.

// A date without a time is due at this hour (UTC).
const DEFAULT_DUE_HOUR_UTC = Number(process.env.TASK_DUE_HOUR_UTC ?? 9);

export const toDueAt = (value) => {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;

  const hour = String(DEFAULT_DUE_HOUR_UTC).padStart(2, "0");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T${hour}:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};
