// Noto — teacher page.
// Step 1: paste text or add a photo → the AI writes 5 languages (via /api/generate)
// Step 2: the teacher checks and edits every language
// Step 3: publish → link, QR code, WhatsApp message

'use strict';

const LANGS = [
  { code: 'en', name: 'English', htmlLang: 'en' },
  { code: 'hi', name: 'हिन्दी', htmlLang: 'hi' },
  { code: 'es', name: 'Español', htmlLang: 'es' },
  { code: 'zh', name: '中文', htmlLang: 'zh-CN' },
  { code: 'vi', name: 'Tiếng Việt', htmlLang: 'vi' },
];
const LANG_NAMES = LANGS.map((l) => l.name).join(' · ');
const MAX_PHOTO_SIDE = 1600; // pixels — enough to read text, small enough to upload fast

const $ = (id) => document.getElementById(id);

const state = {
  image: null, // { mimeType, data } — the shrunk photo, ready to send
  draft: null, // the notice being edited
  editLang: 'en',
  published: null,
};

// ---------- Small helpers ----------

function show(stepId) {
  for (const id of ['step-input', 'step-edit', 'step-share']) $(id).hidden = id !== stepId;
  window.scrollTo({ top: 0 });
}

function showError(boxId, message) {
  const box = $(boxId);
  box.textContent = message;
  box.hidden = !message;
  if (message) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
  const before = button.textContent;
  button.textContent = 'Copied ✓';
  setTimeout(() => (button.textContent = before), 2000);
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
    showError('create-error', 'Could not open that photo. Please use a JPG or PNG photo.');
  }
  $('photo-input').value = ''; // lets the teacher pick the same file again
}

function removePhoto() {
  state.image = null;
  $('photo-preview').hidden = true;
  $('photo-img').removeAttribute('src');
}

function setBusy(busy) {
  const btn = $('create-btn');
  btn.disabled = busy;
  btn.replaceChildren(
    ...(busy ? [el('span', { className: 'spinner' }), ' Writing 5 languages…'] : ['✨ Create in 5 languages'])
  );
  $('create-status').hidden = !busy;
  $('create-status').textContent = busy ? 'Reading the notice. This usually takes 5–15 seconds.' : '';
}

async function onCreate(event) {
  event.preventDefault();
  showError('create-error', '');

  const text = $('notice-text').value.trim();
  const className = $('class-name').value.trim();
  const students = Number($('students').value);

  if (!text && !state.image) return showError('create-error', 'Please paste the notice text or add a photo of it.');
  if (!className) return showError('create-error', 'Please enter the class name (for example "Class 6B").');
  if (!Number.isInteger(students) || students < 1 || students > 1000) {
    return showError('create-error', 'Please enter the number of students (1 to 1000).');
  }

  setBusy(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        image: state.image && { mimeType: state.image.mimeType, data: state.image.data },
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.notice) {
      showError('create-error', data.error || 'Something went wrong. Please try again.');
      return;
    }

    const { warnings, ...notice } = data.notice;
    state.draft = { ...notice, className, students };
    state.editLang = 'en';
    renderWarnings(warnings || []);
    renderEditor();
    show('step-edit');
  } catch (err) {
    showError(
      'create-error',
      err.name === 'AbortError'
        ? 'The AI took too long. Please try again.'
        : 'Could not reach Noto. Please check your internet and try again.'
    );
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

// ---------- Step 2: check and edit ----------

function renderWarnings(warnings) {
  const box = $('warnings');
  box.hidden = warnings.length === 0;
  if (!warnings.length) return;
  const names = Object.fromEntries(LANGS.map((l) => [l.code, l.name]));
  box.replaceChildren(
    el('strong', { textContent: 'Please double-check:' }),
    el('ul', {}, warnings.map((w) => el('li', { textContent: `${names[w.lang] || w.lang}: ${w.message}` })))
  );
}

function renderEditor() {
  const nav = $('edit-langs');
  nav.replaceChildren(
    ...LANGS.map((l) => {
      const btn = el('button', { type: 'button', className: 'lang-btn', lang: l.htmlLang, textContent: l.name });
      btn.setAttribute('aria-pressed', String(l.code === state.editLang));
      btn.addEventListener('click', () => {
        state.editLang = l.code;
        renderEditor();
      });
      return btn;
    })
  );
  renderLanguageFields();
  $('edit-original').value = state.draft.original;
}

function renderLanguageFields() {
  const { code, htmlLang, name } = LANGS.find((l) => l.code === state.editLang);
  const content = state.draft.languages[code];
  const opts = { lang: htmlLang };

  // Title + summary
  const top = el('div', { className: 'edit-group' }, [
    textField(`Title (${name})`, content, 'title', { ...opts, multiline: true, maxLength: 150 }),
    textField('Short summary', content, 'summary', { ...opts, multiline: true, rows: 4, maxLength: 800 }),
  ]);

  // Checklist
  const items = el('div');
  const drawItems = () => {
    items.replaceChildren(
      ...content.checklist.map((text, i) => {
        const area = autoGrow(el('textarea', { value: text, rows: 1, maxLength: 400, lang: htmlLang }));
        area.setAttribute('aria-label', `Checklist item ${i + 1}`);
        area.addEventListener('input', () => (content.checklist[i] = area.value));
        const remove = el('button', { type: 'button', className: 'btn-icon', textContent: '✕' });
        remove.setAttribute('aria-label', `Remove item ${i + 1}`);
        remove.addEventListener('click', () => {
          content.checklist.splice(i, 1);
          drawItems();
        });
        return el('div', { className: 'item-row field' }, [area, remove]);
      })
    );
  };
  drawItems();
  const addItem = el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: '+ Add item' });
  addItem.addEventListener('click', () => {
    content.checklist.push('');
    drawItems();
    items.lastElementChild?.querySelector('textarea').focus();
  });
  const checklist = el('div', { className: 'edit-group' }, [
    el('span', { className: 'field-label', textContent: 'Checklist — what parents must do' }),
    items,
    addItem,
  ]);

  // Dates. The calendar date and times are shared by all languages, so changing them here changes them everywhere.
  const dates = el('div', { className: 'edit-group' }, [el('span', { className: 'field-label', textContent: 'Important dates' })]);
  if (!content.dates.length) dates.append(el('p', { className: 'hint', textContent: 'No dates found in this notice.' }));
  content.dates.forEach((d, i) => {
    const shared = (key, value) => {
      for (const l of LANGS) state.draft.languages[l.code].dates[i][key] = value;
    };
    const dateInput = el('input', { type: 'date', value: d.iso });
    dateInput.addEventListener('input', () => shared('iso', dateInput.value));
    const startInput = el('input', { type: 'time', value: d.start });
    startInput.addEventListener('input', () => shared('start', startInput.value));
    const endInput = el('input', { type: 'time', value: d.end });
    endInput.addEventListener('input', () => shared('end', endInput.value));

    const remove = el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Remove this date (all languages)' });
    remove.addEventListener('click', () => {
      for (const l of LANGS) state.draft.languages[l.code].dates.splice(i, 1);
      renderLanguageFields();
    });

    dates.append(
      el('div', { className: 'card' }, [
        textField('What happens', d, 'label', { ...opts, multiline: true, rows: 1 }),
        textField('Date as parents read it', d, 'date', opts),
        el('div', { className: 'calendar-row' }, [
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: 'Calendar date (all languages)' }), dateInput]),
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: 'Start time' }), startInput]),
          el('label', { className: 'field' }, [el('span', { className: 'hint', textContent: 'End time' }), endInput]),
        ]),
        remove,
      ])
    );
  });

  $('lang-fields').replaceChildren(top, checklist, dates);
}

// Checks every language is complete and tidies the text. Returns an error message, or "".
function tidyDraft() {
  const draft = state.draft;
  draft.original = $('edit-original').value.trim();
  if (!draft.original) return 'The original notice text is empty.';

  for (const { code, name } of LANGS) {
    const c = draft.languages[code];
    c.title = c.title.trim();
    c.summary = c.summary.trim();
    c.checklist = c.checklist.map((t) => t.trim()).filter(Boolean);
    for (const d of c.dates) {
      d.label = d.label.trim();
      d.date = d.date.trim();
    }
    const problem =
      (!c.title && 'the title is empty') ||
      (!c.summary && 'the summary is empty') ||
      (!c.checklist.length && 'the checklist is empty') ||
      (c.dates.some((d) => !d.label || !d.date) && 'a date is missing its text');
    if (problem) {
      state.editLang = code;
      return `${name}: ${problem}.`;
    }
  }
  return '';
}

async function onPublish() {
  showError('publish-error', '');
  const problem = tidyDraft();
  if (problem) {
    renderEditor();
    showError('publish-error', problem);
    return;
  }

  const notice = {
    id: makeId(),
    school: state.draft.school || '',
    className: state.draft.className,
    students: state.draft.students,
    createdAt: new Date().toISOString(),
    original: state.draft.original,
    languages: state.draft.languages,
  };

  const btn = $('publish-btn');
  btn.disabled = true;
  try {
    await saveNotice(notice);
    state.published = notice;
    renderShare(notice);
    show('step-share');
  } catch (err) {
    console.error(err);
    showError('publish-error', 'Could not publish the notice. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

// TEMPORARY (Stage 3): saves the notice in this browser only, so the whole flow can be
// tested before the database exists. Stage 4 replaces this with Firestore.
async function saveNotice(notice) {
  localStorage.setItem(`noto.local.${notice.id}`, JSON.stringify(notice));
}

// ---------- Step 3: share ----------

function renderShare(notice) {
  const link = `${location.origin}/n/${notice.id}`;
  $('share-link').value = link;
  $('open-parent').href = link;

  drawQrCard($('qr-canvas'), link, notice);

  const message = whatsappMessage(notice, link);
  $('wa-text').textContent = message;
  $('open-wa').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function whatsappMessage(notice, link) {
  const en = notice.languages.en;
  const from = [notice.className, notice.school].filter(Boolean).join(' — ');
  return [
    `📢 *${en.title}*`,
    from,
    '',
    en.summary,
    '',
    'Read this notice in simple words, in your language, or listen to it:',
    LANG_NAMES,
    `👉 ${link}`,
    '',
    '_Translated by AI. If unsure, please check with the school._',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}

// Splits text into lines that fit a width on the canvas
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
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

  // Measure the title first so we know how tall the card must be
  const ctx = canvas.getContext('2d');
  ctx.font = `700 36px ${font}`;
  const titleLines = wrapText(ctx, notice.languages.en.title, W - pad * 2);

  const H = pad + 56 + 20 + qrSize + 30 + 40 + 30 + titleLines.length * 46 + 40 + 30 + pad;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let y = pad;
  ctx.font = `800 46px ${font}`;
  ctx.fillText('📱 Scan to read in your language', W / 2, y);
  y += 56 + 20;

  const x0 = Math.round((W - qrSize) / 2);
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x0 + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
    }
  }
  y += qrSize + 30;

  ctx.font = `600 34px ${font}`;
  ctx.fillText(LANG_NAMES, W / 2, y);
  y += 40 + 30;

  ctx.font = `700 36px ${font}`;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 46;
  }

  ctx.font = `400 28px ${font}`;
  ctx.fillStyle = '#555555';
  ctx.fillText([notice.className, notice.school].filter(Boolean).join(' · '), W / 2, y + 10);
}

function downloadQr() {
  $('qr-canvas').toBlob((blob) => {
    const link = el('a', { href: URL.createObjectURL(blob), download: `noto-qr-${state.published.id}.png` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }, 'image/png');
}

function startAgain() {
  $('create-form').reset();
  $('text-count').textContent = '0 / 15,000 characters';
  removePhoto();
  state.draft = null;
  state.published = null;
  show('step-input');
}

// ---------- Start ----------

document.addEventListener('DOMContentLoaded', () => {
  $('notice-text').addEventListener('input', (e) => {
    $('text-count').textContent = `${e.target.value.length.toLocaleString('en')} / 15,000 characters`;
  });
  $('photo-input').addEventListener('change', onPhotoChosen);
  $('photo-remove').addEventListener('click', removePhoto);
  $('create-form').addEventListener('submit', onCreate);

  $('back-btn').addEventListener('click', () => show('step-input'));
  $('publish-btn').addEventListener('click', onPublish);

  $('copy-link').addEventListener('click', (e) => copyText($('share-link').value, e.currentTarget));
  $('copy-wa').addEventListener('click', (e) => copyText($('wa-text').textContent, e.currentTarget));
  $('download-qr').addEventListener('click', downloadQr);
  $('new-btn').addEventListener('click', startAgain);
});
