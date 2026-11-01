// Noto — parent page.
// Shows one notice in the language the parent picks. No login, no personal data.
// This phone only remembers: the chosen language and which checklist items were ticked.

'use strict';

// Each language: the voice to use for "Listen" and words for the page itself.
const LANGS = {
  en: {
    speech: 'en-US',
    htmlLang: 'en',
    ui: {
      checklist: 'What you need to do',
      dates: 'Important dates',
      listen: 'Listen',
      stop: 'Stop',
      google: 'Google Calendar',
      ics: 'Download (.ics)',
      original: 'Show original notice',
      disclaimer: 'Translated by AI. If unsure, please check with the school.',
      loading: 'Loading…',
      notFound: 'Sorry, we could not find this notice. Please check the link or ask the school.',
      error: 'Could not load the notice. Please check your internet and try again.',
      retry: 'Try again',
    },
  },
  hi: {
    speech: 'hi-IN',
    htmlLang: 'hi',
    ui: {
      checklist: 'आपको क्या करना है',
      dates: 'ज़रूरी तारीखें',
      listen: 'सुनें',
      stop: 'रोकें',
      google: 'Google Calendar',
      ics: 'डाउनलोड करें (.ics)',
      original: 'असली नोटिस दिखाएँ',
      disclaimer: 'यह अनुवाद AI ने किया है। अगर कोई शक हो, तो कृपया स्कूल से पूछें।',
      loading: 'लोड हो रहा है…',
      notFound: 'माफ़ कीजिए, यह नोटिस नहीं मिला। कृपया लिंक जाँचें या स्कूल से पूछें।',
      error: 'नोटिस लोड नहीं हो सका। कृपया इंटरनेट जाँचें और फिर से कोशिश करें।',
      retry: 'फिर से कोशिश करें',
    },
  },
  es: {
    speech: 'es-US',
    htmlLang: 'es',
    ui: {
      checklist: 'Lo que debe hacer',
      dates: 'Fechas importantes',
      listen: 'Escuchar',
      stop: 'Detener',
      google: 'Google Calendar',
      ics: 'Descargar (.ics)',
      original: 'Ver el aviso original',
      disclaimer: 'Traducido con IA. Si tiene dudas, consulte con la escuela.',
      loading: 'Cargando…',
      notFound: 'Lo sentimos, no encontramos este aviso. Revise el enlace o pregunte en la escuela.',
      error: 'No se pudo cargar el aviso. Revise su conexión a internet e intente de nuevo.',
      retry: 'Intentar de nuevo',
    },
  },
  zh: {
    speech: 'zh-CN',
    htmlLang: 'zh-CN',
    ui: {
      checklist: '您需要做的事',
      dates: '重要日期',
      listen: '朗读',
      stop: '停止',
      google: 'Google 日历',
      ics: '下载 (.ics)',
      original: '查看原始通知',
      disclaimer: '由 AI 翻译。如有疑问，请向学校确认。',
      loading: '正在加载…',
      notFound: '抱歉，找不到这个通知。请检查链接或询问学校。',
      error: '无法加载通知。请检查网络后重试。',
      retry: '重试',
    },
  },
  vi: {
    speech: 'vi-VN',
    htmlLang: 'vi',
    ui: {
      checklist: 'Việc bạn cần làm',
      dates: 'Ngày quan trọng',
      listen: 'Nghe',
      stop: 'Dừng',
      google: 'Google Calendar',
      ics: 'Tải về (.ics)',
      original: 'Xem thông báo gốc',
      disclaimer: 'Bản dịch do AI thực hiện. Nếu không chắc, vui lòng hỏi lại nhà trường.',
      loading: 'Đang tải…',
      notFound: 'Xin lỗi, không tìm thấy thông báo này. Vui lòng kiểm tra đường dẫn hoặc hỏi nhà trường.',
      error: 'Không tải được thông báo. Vui lòng kiểm tra mạng và thử lại.',
      retry: 'Thử lại',
    },
  },
};

const $ = (id) => document.getElementById(id);

const state = {
  id: null,
  notice: null,
  lang: 'en', // set by pickStartLanguage() when the page starts
  speaking: false,
};

// ---------- Small helpers ----------

// localStorage can be blocked (private mode, old phones), so never let it crash the page.
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

function pickStartLanguage() {
  const saved = store.get('noto.lang');
  if (saved && LANGS[saved]) return saved;
  // First visit: use the phone's language if we support it
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGS[base]) return base;
  }
  return 'en';
}

function getNoticeId() {
  const fromPath = location.pathname.match(/^\/n\/([^/]+)/);
  const id = fromPath ? decodeURIComponent(fromPath[1]) : new URLSearchParams(location.search).get('id');
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

function isValidIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function isValidTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
}

// ---------- Loading the notice ----------

async function loadNotice() {
  showStatus(LANGS[state.lang].ui.loading);
  state.id = getNoticeId();
  if (!state.id) {
    showStatus(LANGS[state.lang].ui.notFound);
    return;
  }

  // Demo notices are plain files. Real notices come from the database through our API.
  const url = state.id.startsWith('demo-')
    ? `/demo/${state.id}.json`
    : `/api/notice?id=${encodeURIComponent(state.id)}`;

  try {
    const res = await fetch(url);
    if (res.status === 404) {
      showStatus(LANGS[state.lang].ui.notFound);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.notice = await res.json();
    render();
    countView();
  } catch (err) {
    console.error(err);
    showStatus(LANGS[state.lang].ui.error, true);
  }
}

// ---------- Counting unique opens (no personal data) ----------

// A random ID made on this phone, like "q3V9-xK2..." — it says nothing about the parent.
function visitorId() {
  let id = store.get('noto.visitor');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set('noto.visitor', id);
  }
  return id;
}

function countView() {
  if (state.id.startsWith('demo-')) return; // demos are not counted
  if (store.get(`noto.own.${state.id}`)) return; // the teacher who published it, on their own phone
  if (store.get(`noto.seen.${state.id}`)) return; // this phone was already counted
  fetch('/api/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: state.id, visitor: visitorId() }),
    keepalive: true,
  })
    .then((res) => res.ok && store.set(`noto.seen.${state.id}`, '1'))
    .catch(() => {
      /* counting is not important enough to bother the parent */
    });
}

function showStatus(message, withRetry = false) {
  const box = $('status');
  box.textContent = message;
  if (withRetry) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.type = 'button';
    btn.textContent = LANGS[state.lang].ui.retry;
    btn.addEventListener('click', loadNotice);
    box.append(document.createElement('br'), btn);
  }
  box.hidden = false;
  $('notice').hidden = true;
}

// ---------- Showing the notice ----------

function render() {
  const notice = state.notice;
  // If the notice is missing the chosen language, fall back to English
  const lang = notice.languages[state.lang] ? state.lang : 'en';
  const content = notice.languages[lang];
  const ui = LANGS[lang].ui;

  document.documentElement.lang = LANGS[lang].htmlLang;
  document.title = `${content.title} — Noto`;

  for (const btn of document.querySelectorAll('.lang-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  }

  $('from').textContent = [notice.school, notice.className].filter(Boolean).join(' · ');
  $('title').textContent = content.title;
  $('summary').textContent = content.summary;

  $('h-checklist').textContent = ui.checklist;
  renderChecklist(content.checklist || []);

  $('h-dates').textContent = ui.dates;
  renderDates(content, ui);

  $('h-original').textContent = ui.original;
  $('original').textContent = notice.original || '';

  $('disclaimer').textContent = ui.disclaimer;

  stopSpeaking();
  updateListenButton();

  $('status').hidden = true;
  $('notice').hidden = false;
}

function renderChecklist(items) {
  // Ticks are saved per notice. Item order is the same in every language,
  // so a tick stays when the parent switches language.
  const key = `noto.done.${state.id}`;
  let done = [];
  try {
    done = JSON.parse(store.get(key) || '[]');
  } catch {
    done = [];
  }

  const list = $('checklist');
  list.replaceChildren();
  items.forEach((text, i) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = done.includes(i);
    box.addEventListener('change', () => {
      done = box.checked ? [...new Set([...done, i])] : done.filter((n) => n !== i);
      store.set(key, JSON.stringify(done));
    });
    const span = document.createElement('span');
    span.textContent = text;
    label.append(box, span);
    li.append(label);
    list.append(li);
  });
}

function renderDates(content, ui) {
  const dates = content.dates || [];
  $('dates-card').hidden = dates.length === 0;

  const list = $('dates');
  list.replaceChildren();
  dates.forEach((d, i) => {
    const li = document.createElement('li');
    li.className = 'date-item';

    const when = document.createElement('div');
    when.className = 'date-text';
    when.textContent = d.date;

    const label = document.createElement('div');
    label.className = 'date-label';
    label.textContent = d.label;

    li.append(when, label);

    // Calendar buttons only when we know the exact day
    if (isValidIsoDate(d.iso)) {
      const actions = document.createElement('div');
      actions.className = 'date-actions';

      const google = document.createElement('a');
      google.className = 'btn btn-secondary btn-small';
      google.href = googleCalendarUrl(d, content.title);
      google.target = '_blank';
      google.rel = 'noopener';
      google.textContent = '📅 ' + ui.google;

      const ics = document.createElement('button');
      ics.className = 'btn btn-secondary btn-small';
      ics.type = 'button';
      ics.textContent = '⬇️ ' + ui.ics;
      ics.addEventListener('click', () => downloadIcs(d, content.title, i));

      actions.append(google, ics);
      li.append(actions);
    }
    list.append(li);
  });
}

// ---------- Add to calendar ----------

// Works out start and end in calendar format.
// No time → an all-day event. Times have no timezone on purpose ("floating"),
// so 6:30 AM means 6:30 AM wherever the parent's phone is.
function eventTimes(d) {
  const day = d.iso.replaceAll('-', '');
  if (!isValidTime(d.start)) {
    const next = new Date(d.iso + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    return { allDay: true, start: day, end: next.toISOString().slice(0, 10).replaceAll('-', '') };
  }
  let end = d.end;
  if (!isValidTime(end) || end <= d.start) {
    // No end time given: make it one hour long
    const [h, m] = d.start.split(':').map(Number);
    end = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return {
    allDay: false,
    start: `${day}T${d.start.replace(':', '')}00`,
    end: `${day}T${end.replace(':', '')}00`,
  };
}

function eventTitle(d, noticeTitle) {
  return `${d.label} — ${noticeTitle}`;
}

function googleCalendarUrl(d, noticeTitle) {
  const t = eventTimes(d);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(d, noticeTitle),
    dates: `${t.start}/${t.end}`,
    details: `${state.notice.languages[state.lang]?.summary || ''}\n\n${location.href}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Calendar files need long lines split every 75 bytes (not letters — Hindi and Chinese letters use 3 bytes)
function icsFold(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 73) {
      parts.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n');
}

function downloadIcs(d, noticeTitle, index) {
  const t = eventTimes(d);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const content = state.notice.languages[state.lang] || state.notice.languages.en;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Noto//School notices//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${state.id}-${index}@noto`,
    `DTSTAMP:${stamp}`,
    t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART:${t.start}`,
    t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND:${t.end}`,
    `SUMMARY:${icsEscape(eventTitle(d, noticeTitle))}`,
    `DESCRIPTION:${icsEscape(content.summary + '\n\n' + location.href)}`,
    `URL:${location.href}`,
    // Reminder: 9 AM the day before (all-day) or 1 day before (timed)
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(d.label)}`,
    t.allDay ? 'TRIGGER:-PT15H' : 'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const text = lines.map(icsFold).join('\r\n') + '\r\n';

  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `noto-${d.iso}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// ---------- Listen (Web Speech API) ----------

const speech = 'speechSynthesis' in window ? window.speechSynthesis : null;

// Joke / sound-effect voices that some computers (macOS) include — never pick these.
const SILLY_VOICES = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

// From several matching voices, pick the phone's default one, or any normal one.
function bestVoice(list) {
  const normal = list.filter((v) => !SILLY_VOICES.test(v.name));
  return normal.find((v) => v.default) || normal[0] || null;
}

// Find a voice on this phone for the language. Returns null if there is none.
function findVoice(lang) {
  if (!speech) return null;
  const voices = speech.getVoices();
  const wanted = LANGS[lang].speech.toLowerCase(); // e.g. "hi-in"
  const base = wanted.split('-')[0]; // e.g. "hi"
  const norm = (v) => v.lang.replace('_', '-').toLowerCase();

  const exact = bestVoice(voices.filter((v) => norm(v) === wanted || norm(v).startsWith(wanted + '-')));
  if (exact) return exact;

  if (lang === 'zh') {
    // Prefer Mandarin (Simplified). Skip Cantonese (yue / zh-HK) — it sounds different.
    return (
      bestVoice(voices.filter((v) => /^(zh-hans|cmn)/.test(norm(v)))) ||
      bestVoice(voices.filter((v) => norm(v).startsWith('zh') && !/(hk|yue)/.test(norm(v))))
    );
  }
  return bestVoice(voices.filter((v) => norm(v) === base || norm(v).startsWith(base + '-')));
}

function updateListenButton() {
  const lang = state.notice?.languages[state.lang] ? state.lang : 'en';
  const voice = findVoice(lang);
  // No voice for this language on this phone → quietly hide the button
  $('listen').hidden = !voice;
  $('listen-text').textContent = state.speaking ? LANGS[lang].ui.stop : LANGS[lang].ui.listen;
}

// Split long text into short pieces. Some phones stop reading after ~15 seconds of one long text.
function splitForSpeech(text) {
  return String(text)
    .split(/(?<=[.!?。！？।])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function startSpeaking() {
  const lang = state.notice.languages[state.lang] ? state.lang : 'en';
  const voice = findVoice(lang);
  if (!voice) return;

  const content = state.notice.languages[lang];
  const ui = LANGS[lang].ui;
  const pieces = [
    content.title,
    ...splitForSpeech(content.summary),
    ui.checklist,
    ...content.checklist.flatMap(splitForSpeech),
  ];
  if (content.dates?.length) {
    pieces.push(ui.dates);
    for (const d of content.dates) pieces.push(`${d.date}. ${d.label}.`);
  }

  speech.cancel();
  state.speaking = true;
  updateListenButton();

  pieces.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9; // a little slower, easier to follow
    if (i === pieces.length - 1) {
      u.onend = () => {
        state.speaking = false;
        updateListenButton();
      };
    }
    u.onerror = () => {
      state.speaking = false;
      updateListenButton();
    };
    speech.speak(u);
  });
}

function stopSpeaking() {
  if (speech) speech.cancel();
  state.speaking = false;
}

// ---------- Start ----------

document.addEventListener('DOMContentLoaded', () => {
  state.lang = pickStartLanguage();

  for (const btn of document.querySelectorAll('.lang-btn')) {
    btn.addEventListener('click', () => {
      state.lang = btn.dataset.lang;
      store.set('noto.lang', state.lang);
      if (state.notice) render();
    });
  }

  $('listen').addEventListener('click', () => {
    if (state.speaking) {
      stopSpeaking();
      updateListenButton();
    } else {
      startSpeaking();
    }
  });

  // Voices load a moment after the page on some browsers
  if (speech) {
    speech.addEventListener?.('voiceschanged', () => state.notice && updateListenButton());
  }

  loadNotice();
});
