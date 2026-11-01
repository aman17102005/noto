// The shape of an AI-made notice, and the checks we run before we trust it.
// Files and folders in api/ that start with "_" are helpers, not web endpoints.

export const LANGUAGE_CODES = ['en', 'hi', 'es', 'zh', 'vi'];

// ---------- JSON schema we give to Gemini ----------
// Gemini must fill in exactly this shape (structured output), so we never have to
// pull JSON out of a chatty answer.

const dateSchema = {
  type: 'OBJECT',
  properties: {
    label: { type: 'STRING', description: 'What happens on this date, in this language.' },
    date: { type: 'STRING', description: 'The date written out in this language, e.g. "Friday, 11 December 2026".' },
    iso: { type: 'STRING', description: 'The same date as YYYY-MM-DD. Same value in every language.' },
    start: { type: 'STRING', description: 'Start time as 24-hour HH:MM, or "" if no time is given.' },
    end: { type: 'STRING', description: 'End time as 24-hour HH:MM, or "" if no end time is given.' },
  },
  required: ['label', 'date', 'iso', 'start', 'end'],
  propertyOrdering: ['label', 'date', 'iso', 'start', 'end'],
};

const languageSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Short title, at most 8 words.' },
    summary: { type: 'STRING', description: '2 or 3 short, simple sentences.' },
    checklist: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Every action for the parent, one per item.' },
    dates: { type: 'ARRAY', items: dateSchema },
  },
  required: ['title', 'summary', 'checklist', 'dates'],
  propertyOrdering: ['title', 'summary', 'checklist', 'dates'],
};

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['ok', 'unclear', 'not_a_notice'] },
    problem: { type: 'STRING', description: 'If status is not "ok": one short sentence saying why. Otherwise "".' },
    school: { type: 'STRING', description: 'School or college name exactly as written, or "".' },
    original: { type: 'STRING', description: 'The full notice text exactly as written (typed out from the photo if needed).' },
    languages: {
      type: 'OBJECT',
      properties: Object.fromEntries(LANGUAGE_CODES.map((code) => [code, languageSchema])),
      required: LANGUAGE_CODES,
      propertyOrdering: LANGUAGE_CODES,
    },
  },
  required: ['status', 'problem', 'school', 'original', 'languages'],
  propertyOrdering: ['status', 'problem', 'school', 'original', 'languages'],
};

// ---------- Checks ----------

const LIMITS = {
  original: 20000,
  title: 150,
  summary: 800,
  item: 400,
  maxItems: 15,
  maxDates: 12,
};

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

export function isValidIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function isValidTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

// Checks one language. Returns { value } when fine, or { error } explaining what is wrong.
export function checkLanguage(lang) {
  if (!lang || typeof lang !== 'object') return { error: 'missing' };

  const title = cleanText(lang.title, LIMITS.title);
  if (!title) return { error: 'title is missing or too long' };

  const summary = cleanText(lang.summary, LIMITS.summary);
  if (!summary) return { error: 'summary is missing or too long' };

  if (!Array.isArray(lang.checklist)) return { error: 'checklist is not a list' };
  const checklist = lang.checklist.map((item) => cleanText(item, LIMITS.item)).filter(Boolean);
  if (checklist.length === 0 || checklist.length > LIMITS.maxItems) return { error: 'checklist has a bad number of items' };

  if (!Array.isArray(lang.dates) || lang.dates.length > LIMITS.maxDates) return { error: 'dates is not a list' };
  const dates = [];
  for (const d of lang.dates) {
    const label = cleanText(d?.label, LIMITS.item);
    const date = cleanText(d?.date, LIMITS.item);
    if (!label || !date) return { error: 'a date is missing its label or text' };
    const iso = typeof d.iso === 'string' && isValidIsoDate(d.iso.trim()) ? d.iso.trim() : '';
    const start = typeof d.start === 'string' && isValidTime(d.start.trim()) ? d.start.trim() : '';
    const end = start && typeof d.end === 'string' && isValidTime(d.end.trim()) ? d.end.trim() : '';
    dates.push({ label, date, iso, start, end });
  }

  return { value: { title, summary, checklist, dates } };
}

// Finds money amounts like ₹450, Rs. 1,200, $25.00 or 450 ₹ and returns just the digits ("450", "1200", "2500").
const MONEY = /(?:₹|\bRs\.?|\bINR|US\$|\$|€|£)\s?\d(?:[\d,.]*\d)?|\d(?:[\d,.]*\d)?\s?(?:₹|€|£)/gi;

export function moneyAmounts(text) {
  return new Set((String(text).match(MONEY) || []).map((m) => m.replace(/\D/g, '')).filter(Boolean));
}

// Safety net: if a translation mentions money that is not in the original notice,
// warn the teacher so they check it before publishing.
function findChangedAmounts(original, languages) {
  const allowed = moneyAmounts(original);
  const warnings = [];
  for (const [code, lang] of Object.entries(languages)) {
    const text = [lang.title, lang.summary, ...lang.checklist, ...lang.dates.map((d) => d.label)].join('\n');
    for (const amount of moneyAmounts(text)) {
      if (!allowed.has(amount)) {
        warnings.push({ lang: code, message: `An amount of money (${amount}) is not in the original notice. Please check it.` });
      }
    }
  }
  return warnings;
}

function fail(code, detail = '') {
  return { ok: false, code, detail };
}

// Checks Gemini's whole answer. Returns { ok: true, notice } or { ok: false, code, detail }.
export function checkNotice(data) {
  if (!data || typeof data !== 'object') return fail('bad_format', 'not an object');

  const problem = typeof data.problem === 'string' ? data.problem.trim().slice(0, 300) : '';
  if (data.status === 'unclear') return fail('unclear', problem);
  if (data.status === 'not_a_notice') return fail('not_a_notice', problem);
  if (data.status !== 'ok') return fail('bad_format', 'unknown status');

  const original = cleanText(data.original, LIMITS.original);
  if (!original) return fail('bad_format', 'original text is missing');

  const school = typeof data.school === 'string' ? data.school.trim().slice(0, 150) : '';

  const languages = {};
  for (const code of LANGUAGE_CODES) {
    const result = checkLanguage(data.languages?.[code]);
    if (result.error) return fail('bad_format', `${code}: ${result.error}`);
    languages[code] = result.value;
  }

  // Calendar data must be the same in every language. English is the reference.
  const enDates = languages.en.dates;
  for (const code of LANGUAGE_CODES) {
    const dates = languages[code].dates;
    if (dates.length !== enDates.length) return fail('bad_format', `${code}: different number of dates`);
    dates.forEach((d, i) => {
      d.iso = enDates[i].iso;
      d.start = enDates[i].start;
      d.end = enDates[i].end;
    });
  }

  return {
    ok: true,
    notice: { school, original, languages, warnings: findChangedAmounts(original, languages) },
  };
}
