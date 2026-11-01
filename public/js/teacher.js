// Noto — teacher page.
// Step 1: paste text or add a photo → the AI writes 5 languages (via /api/generate)
// Step 2: the teacher checks and edits every language
// Step 3: publish → link, QR code, WhatsApp message
// Teachers must be signed in (Google login, handled by auth.js).
// The whole page speaks the language the teacher picks (teacher-i18n.js). Picking a language
// button in the editor also switches the page, so every line is in that one language.

import { setupTeacherPage, loginToken, saveNotice, shareBaseUrl } from './auth.js';
import { LANGS, audienceLabel, langInfo, langName, setUiLang, t, uiLang, hasText } from './teacher-i18n.js';

const LANG_LIST = LANGS.map((l) => l.name).join(' · '); // each name in its own language, so parents find theirs
const MAX_PHOTO_SIDE = 1600; // pixels — enough to read text, small enough to upload fast
const MAX_CLASSES = 30;

const $ = (id) => document.getElementById(id);

const state = {
  image: null, // { mimeType, data } — the shrunk photo, ready to send
  classes: [], // e.g. ["6A", "6B"] when the notice is for some classes, not the whole school
  baseUrl: '', // start of the share link (website address, or Wi-Fi address in phone test mode)
  draft: null, // the notice being edited
  warnings: [],
  busy: false,
  published: null,
  errors: {}, // the message shown in each error box, kept so it can be re-shown in a new language
};

// ---------- Small helpers ----------

function show(stepId) {
  for (const id of ['step-input', 'step-edit', 'step-share']) $(id).hidden = id !== stepId;
  window.scrollTo({ top: 0 });
}

// Shows a message from teacher-i18n.js in an error box. "raw" is the server's own English
// message, which has extra detail — used only when the page is in English.
function showError(boxId, key, { vars = {}, raw = '' } = {}) {
  state.errors[boxId] = key ? { key, vars, raw } : null;
  drawError(boxId);
  if (key) $(boxId).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function drawError(boxId) {
  const error = state.errors[boxId];
  const box = $(boxId);
  box.hidden = !error;
  box.textContent = !error ? '' : uiLang() === 'en' && error.raw ? error.raw : t(error.key, error.vars);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

// Makes a text box exactly as tall as its text, so nothing is hidden on small phones
function autoGrow(area) {
  const fit = () => {
    area.style.height = 'auto';
    area.style.height = area.scrollHeight + 4 + 'px';
  };
  area.addEventListener('input', fit);
  requestAnimationFrame(fit); // after it is on the page
  return area;
}

// A label + input/textarea that writes straight into an object when the teacher types
function textField(label, obj, key, { multiline = false, rows = 2, maxLength = 400, lang } = {}) {
  const input = el(multiline ? 'textarea' : 'input', { value: obj[key] || '', maxLength });
  if (multiline) autoGrow(Object.assign(input, { rows }));
  if (lang) input.lang = lang;
  input.addEventListener('input', () => {
    obj[key] = input.value;
  });
  return el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: label }), input]);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers: copy using a hidden text box
    const area = el('textarea', { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.textContent = t('copied');
  setTimeout(() => (button.textContent = t(button.dataset.i18n)), 2000);
}

// Random, hard-to-guess notice ID like "k7m2xq9p" (no 0/o or 1/l, so it is easy to read)
function makeId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// ---------- Step 1: input ----------

// Phone photos are often 3–8 MB. Shrink to max 1600px and save as JPEG (~200–500 KB).
async function shrinkPhoto(file) {
  const picture = await openPicture(file);
  const width = picture.naturalWidth || picture.width;
  const height = picture.naturalHeight || picture.height;
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const canvas = el('canvas', { width: Math.round(width * scale), height: Math.round(height * scale) });
  canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
  picture.close?.(); // frees memory (ImageBitmap only)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1], previewUrl: dataUrl };
}

// Reads a photo file. createImageBitmap is the modern, reliable way (it also turns
// sideways phone photos the right way up). Older phones fall back to a normal <img>.
async function openPicture(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* try the old way below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function onPhotoChosen() {
  const file = $('photo-input').files[0];
  if (!file) return;
  showError('create-error', '');
  try {
    state.image = await shrinkPhoto(file);
    $('photo-img').src = state.image.previewUrl;
    $('photo-preview').hidden = false;
  } catch {
    state.image = null;
    $('photo-preview').hidden = true;
    showError('create-error', 'errPhoto');
  }
  $('photo-input').value = ''; // lets the teacher pick the same file again
}

function removePhoto() {
  state.image = null;
  $('photo-preview').hidden = true;
  $('photo-img').removeAttribute('src');
}

function drawCharCount() {
  const n = $('notice-text').value.length.toLocaleString(langInfo().locale);
  $('text-count').textContent = t('charCount', { n });
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('create-btn');
  btn.disabled = busy;
  btn.replaceChildren(...(busy ? [el('span', { className: 'spinner' }), ' ' + t('creatingBtn')] : [t('createBtn')]));
  $('create-status').hidden = !busy;
  $('create-status').textContent = busy ? t('creatingStatus') : '';
}

// Turns the server's error code into a message in the teacher's language
function apiErrorKey(code) {
  const sameAs = { empty: 'errNoInput', bad_image: 'errPhoto', timeout: 'errTimeout', bad_format: 'api_ai_error', network: 'api_ai_error' };
  if (sameAs[code]) return sameAs[code];
  return hasText(`api_${code}`) ? `api_${code}` : 'errGeneric';
}

async function onCreate(event) {
  event.preventDefault();
  showError('create-error', '');

  const text = $('notice-text').value.trim();
  addClass(); // a class typed but not added yet still counts
  const audience = forWholeSchool() ? { type: 'school' } : { type: 'classes', classes: [...state.classes] };
  const studentsText = $('students').value.trim();
  const students = studentsText ? Number(studentsText) : null; // optional

  if (!text && !state.image) return showError('create-error', 'errNoInput');
  if (audience.type === 'classes' && !audience.classes.length) return showError('create-error', 'errClass');
  if (students !== null && (!Number.isInteger(students) || students < 1 || students > 5000)) {
    return showError('create-error', 'errStudents');
  }

  setBusy(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await loginToken()}` },
      body: JSON.stringify({
        text,
        image: state.image && { mimeType: state.image.mimeType, data: state.image.data },
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.notice) {
      showError('create-error', apiErrorKey(data.code), { raw: data.error });
      return;
    }

    const { warnings, ...notice } = data.notice;
    state.draft = { ...notice, audience, students };
    state.warnings = warnings || [];
    renderWarnings();
    renderEditor();
    show('step-edit');
  } catch (err) {
    showError('create-error', err.name === 'AbortError' ? 'errTimeout' : 'errOffline');
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

// ---------- Who the notice is for ----------

function forWholeSchool() {
  return document.querySelector('input[name="audience"]:checked').value === 'school';
}

// "Class 6a" or "std 6a" → "6A", so every language can put its own word for "class" in front
function tidyClassName(text) {
  const name = text.trim().replace(/^(class|std\.?|standard|grade)\s*/i, '').replace(/\s+/g, ' ');
  return /^\d{1,2}\s?[a-z]?$/i.test(name) ? name.replace(/\s/g, '').toUpperCase() : name;
}

// Adds what is typed in the class box (several at once if separated by commas)
function addClass() {
  const input = $('class-input');
  for (const part of input.value.split(',')) {
    const name = tidyClassName(part);
    const known = state.classes.some((c) => c.toLowerCase() === name.toLowerCase());
    if (name && !known && state.classes.length < MAX_CLASSES) state.classes.push(name);
  }
  input.value = '';
  drawClasses();
}

function drawClasses() {
  $('classes-box').hidden = forWholeSchool();
  $('class-chips').replaceChildren(
    ...state.classes.map((name, i) => {
      const remove = el('button', { type: 'button', className: 'chip-remove', textContent: '✕' });
      remove.setAttribute('aria-label', t('removeClass', { name }));
      remove.addEventListener('click', () => {
        state.classes.splice(i, 1);
        drawClasses();
      });
      return el('li', { className: 'chip' }, [el('span', { textContent: name }), remove]);
    })
  );
}

// ---------- Step 2: check and edit ----------

function renderWarnings() {
  const box = $('warnings');
  box.hidden = state.warnings.length === 0;
  if (!state.warnings.length) return;
  box.replaceChildren(
    el('strong', { textContent: t('doubleCheck') }),
    el(
      'ul',
      {},
      state.warnings.map((w) => el('li', { textContent: `${langName(w.lang)}: ${t('warnMoney', { amount: w.amount })}` }))
    )
  );
}

function renderEditor() {
  const nav = $('edit-langs');
  nav.replaceChildren(
    ...LANGS.map((l) => {
      const btn = el('button', { type: 'button', className: 'lang-btn', lang: l.htmlLang, textContent: l.name });
      btn.setAttribute('aria-pressed', String(l.code === uiLang()));
      // Picking a language here switches the whole page to that language
      btn.addEventListener('click', () => setUiLang(l.code));
      return btn;
    })
  );
  renderLanguageFields();
  $('edit-original').value = state.draft.original;
}

function renderLanguageFields() {
  const { code, htmlLang } = langInfo();
  const content = state.draft.languages[code];
  const opts = { lang: htmlLang };

  // Title + summary
  const top = el('div', { className: 'edit-group' }, [
    textField(t('fieldTitle'), content, 'title', { ...opts, multiline: true, maxLength: 150 }),
    textField(t('fieldSummary'), content, 'summary', { ...opts, multiline: true, rows: 4, maxLength: 800 }),
  ]);

  // Checklist
  const items = el('div');
  const drawItems = () => {
    items.replaceChildren(
      ...content.checklist.map((text, i) => {
        const area = autoGrow(el('textarea', { value: text, rows: 1, maxLength: 400, lang: htmlLang }));
        area.setAttribute('aria-label', t('itemLabel', { n: i + 1 }));
        area.addEventListener('input', () => (content.checklist[i] = area.value));
        const remove = el('button', { type: 'button', className: 'btn-icon', textContent: '✕' });
        remove.setAttribute('aria-label', t('removeItem', { n: i + 1 }));
        remove.addEventListener('click', () => {
          content.checklist.splice(i, 1);
          drawItems();
        });
        return el('div', { className: 'item-row field' }, [area, remove]);
      })
    );
  };
  drawItems();
  const addItem = el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: t('addItem') });
  addItem.addEventListener('click', () => {
    content.checklist.push('');
    drawItems();
    items.lastElementChild?.querySelector('textarea').focus();
  });
  const checklist = el('div', { className: 'edit-group' }, [
    el('span', { className: 'field-label', textContent: t('fieldChecklist') }),
    items,
    addItem,
  ]);

  // Dates. The calendar date and times are shared by all languages, so changing them here changes them everywhere.
  const dates = el('div', { className: 'edit-group' }, [el('span', { className: 'field-label', textContent: t('fieldDates') })]);
  if (!content.dates.length) dates.append(el('p', { className: 'hint', textContent: t('noDates') }));
  content.dates.forEach((d, i) => {
    const shared = (key, value) => {
      for (const l of LANGS) state.draft.languages[l.code].dates[i][key] = value;
    };
    const dateInput = el('input', { type: 'date', value: d.iso, lang: htmlLang });
    dateInput.addEventListener('input', () => shared('iso', dateInput.value));
    const startInput = el('input', { type: 'time', value: d.start, lang: htmlLang });
    startInput.addEventListener('input', () => shared('start', startInput.value));
    const endInput = el('input', { type: 'time', value: d.end, lang: htmlLang });
    endInput.addEventListener('input', () => shared('end', endInput.value));

    const remove = el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: t('removeDate') });
    remove.addEventListener('click', () => {
      for (const l of LANGS) state.draft.languages[l.code].dates.splice(i, 1);
      renderLanguageFields();
    });

    dates.append(
      el('div', { className: 'card' }, [
        textField(t('dateWhat'), d, 'label', { ...opts, multiline: true, rows: 1 }),
        textField(t('dateText'), d, 'date', opts),
        el('div', { className: 'calendar-row' }, [
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: t('dateCalendar') }), dateInput]),
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: t('startTime') }), startInput]),
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: t('endTime') }), endInput]),
        ]),
        remove,
      ])
    );
  });

  $('lang-fields').replaceChildren(top, checklist, dates);
}

// Checks every language is complete and tidies the text.
// Returns null when fine, or { key, code } for the first problem found.
function tidyDraft() {
  const draft = state.draft;
  draft.original = $('edit-original').value.trim();
  if (!draft.original) return { key: 'errOriginalEmpty' };

  for (const { code } of LANGS) {
    const c = draft.languages[code];
    c.title = c.title.trim();
    c.summary = c.summary.trim();
    c.checklist = c.checklist.map((item) => item.trim()).filter(Boolean);
    for (const d of c.dates) {
      d.label = d.label.trim();
      d.date = d.date.trim();
    }
    const key =
      (!c.title && 'errEmptyTitle') ||
      (!c.summary && 'errEmptySummary') ||
      (!c.checklist.length && 'errEmptyChecklist') ||
      (c.dates.some((d) => !d.label || !d.date) && 'errDateText');
    if (key) return { key, code };
  }
  return null;
}

async function onPublish() {
  showError('publish-error', '');
  const problem = tidyDraft();
  if (problem) {
    // Jump to the language that needs fixing (the whole page switches to it)
    if (problem.code) setUiLang(problem.code);
    renderEditor();
    showError('publish-error', problem.key, { vars: { lang: problem.code ? langName(problem.code) : '' } });
    return;
  }

  const notice = {
    id: makeId(),
    school: state.draft.school || '',
    audience: state.draft.audience,
    students: state.draft.students,
    createdAt: new Date().toISOString(),
    original: state.draft.original,
    languages: state.draft.languages,
  };

  const btn = $('publish-btn');
  btn.disabled = true;
  try {
    await saveNotice(notice);
    // So the teacher opening their own link on this phone is not counted as a parent
    try {
      localStorage.setItem(`noto.own.${notice.id}`, '1');
    } catch {
      /* ignore */
    }
    state.published = notice;
    state.baseUrl = await shareBaseUrl();
    renderShare();
    show('step-share');
  } catch (err) {
    // Firebase tells us why: "permission-denied" means the security rules said no
    console.error('Publish failed:', err.code, err.message);
    const key = { 'permission-denied': 'errPublishRules', unavailable: 'errPublishOffline' }[err.code] || 'errPublish';
    showError('publish-error', key);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Step 3: share ----------
// The QR card and the WhatsApp message use the chosen language too.
// Switch the language and download again to get a card for a different group of parents.

function renderShare() {
  const notice = state.published;
  const link = `${state.baseUrl}/n/${notice.id}`;
  $('share-link').value = link;
  $('open-parent').href = link;

  drawQrCard($('qr-canvas'), link, notice);

  const message = whatsappMessage(notice, link);
  $('wa-text').textContent = message;
  $('wa-text').lang = langInfo().htmlLang;
  $('open-wa').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function whatsappMessage(notice, link) {
  const content = notice.languages[uiLang()];
  const from = [audienceLabel(notice), notice.school].filter(Boolean).join(' — ');
  return [
    `📢 *${content.title}*`,
    from,
    '',
    content.summary,
    '',
    t('waRead'),
    LANG_LIST,
    `👉 ${link}`,
    '',
    `_${t('waDisclaimer')}_`,
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}

// Splits text into lines that fit a width on the canvas.
// Chinese has no spaces between words, so it is split letter by letter.
function wrapText(ctx, text, maxWidth) {
  const parts = /\s/.test(text) ? text.split(' ') : Array.from(text);
  const joiner = /\s/.test(text) ? ' ' : '';
  const lines = [];
  let line = '';
  for (const part of parts) {
    const test = line ? line + joiner + part : part;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = part;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Draws a printable card: a heading, the QR code, the languages and the notice title
function drawQrCard(canvas, link, notice) {
  const qr = qrcode(0, 'M'); // 0 = pick the size automatically, M = can survive ~15% damage (folds, smudges)
  qr.addData(link);
  qr.make();

  const W = 1000;
  const pad = 60;
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Noto Sans SC", sans-serif';
  const modules = qr.getModuleCount();
  const quiet = 4; // the empty border scanners need
  const cell = Math.floor(720 / (modules + quiet * 2));
  const qrSize = cell * (modules + quiet * 2);

  // Measure the heading and title first so we know how tall the card must be
  const ctx = canvas.getContext('2d');
  ctx.font = `800 46px ${font}`;
  const headingLines = wrapText(ctx, t('qrHeading'), W - pad * 2);
  ctx.font = `700 36px ${font}`;
  const titleLines = wrapText(ctx, notice.languages[uiLang()].title, W - pad * 2);

  const H = pad + headingLines.length * 58 + 20 + qrSize + 30 + 40 + 30 + titleLines.length * 46 + 40 + 30 + pad;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let y = pad;
  ctx.font = `800 46px ${font}`;
  for (const line of headingLines) {
    ctx.fillText(line, W / 2, y);
    y += 58;
  }
  y += 20;

  const x0 = Math.round((W - qrSize) / 2);
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x0 + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
    }
  }
  y += qrSize + 30;

  ctx.font = `600 34px ${font}`;
  ctx.fillText(LANG_LIST, W / 2, y);
  y += 40 + 30;

  ctx.font = `700 36px ${font}`;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 46;
  }

  ctx.font = `400 28px ${font}`;
  ctx.fillStyle = '#555555';
  ctx.fillText([audienceLabel(notice), notice.school].filter(Boolean).join(' · '), W / 2, y + 10);
}

function downloadQr() {
  $('qr-canvas').toBlob((blob) => {
    const link = el('a', { href: URL.createObjectURL(blob), download: `noto-qr-${state.published.id}-${uiLang()}.png` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }, 'image/png');
}

function startAgain() {
  $('create-form').reset();
  state.classes = [];
  drawClasses();
  drawCharCount();
  removePhoto();
  state.draft = null;
  state.published = null;
  state.warnings = [];
  show('step-input');
}

// ---------- When the language changes, redraw everything that is not plain page text ----------

document.addEventListener('noto:language', () => {
  drawCharCount();
  drawClasses();
  if (state.busy) setBusy(true);
  for (const boxId of Object.keys(state.errors)) drawError(boxId);
  if (state.draft) {
    renderWarnings();
    renderEditor();
  }
  if (state.published) renderShare();
});

// ---------- Start ----------

setupTeacherPage({ onSignedIn: () => {} });
drawCharCount();

$('notice-text').addEventListener('input', drawCharCount);
$('photo-input').addEventListener('change', onPhotoChosen);
$('photo-remove').addEventListener('click', removePhoto);
$('create-form').addEventListener('submit', onCreate);

for (const radio of document.querySelectorAll('input[name="audience"]')) radio.addEventListener('change', drawClasses);
$('add-class').addEventListener('click', addClass);
$('class-input').addEventListener('keydown', (e) => {
  // Enter adds the class instead of sending the whole form
  if (e.key === 'Enter') {
    e.preventDefault();
    addClass();
  }
});
drawClasses();

$('back-btn').addEventListener('click', () => show('step-input'));
$('publish-btn').addEventListener('click', onPublish);

$('copy-link').addEventListener('click', (e) => copyText($('share-link').value, e.currentTarget));
$('copy-wa').addEventListener('click', (e) => copyText($('wa-text').textContent, e.currentTarget));
$('download-qr').addEventListener('click', downloadQr);
$('new-btn').addEventListener('click', startAgain);
