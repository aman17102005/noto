// Noto — teacher dashboard: every notice with "X of Y opened".
// Shown in the language the teacher picked (teacher-i18n.js).

import { setupTeacherPage, myNotices, countViews, deleteNotice } from './auth.js';
import { langInfo, t, uiLang } from './teacher-i18n.js';

const $ = (id) => document.getElementById(id);

const state = {
  notices: [],
  counts: {}, // notice id → number of phones that opened it (fetched once, kept when the language changes)
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function formatDate(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleDateString(langInfo().locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// The notice title in the teacher's language (English if missing)
function titleOf(notice) {
  return notice.languages?.[uiLang()]?.title || notice.languages?.en?.title || t('noTitle');
}

async function copyLink(link, button) {
  try {
    await navigator.clipboard.writeText(link);
    button.textContent = t('copied');
  } catch {
    prompt(t('copyPrompt'), link);
  }
  setTimeout(() => (button.textContent = t('copyLink')), 2000);
}

// "{n} of {total} opened" with the number made big. Word order differs by language,
// so the sentence is split around {n} instead of being glued together.
function openedLine(notice) {
  const n = state.counts[notice.id];
  const [before, after = ''] = t('opened', { n: '\u0000', total: notice.students }).split('\u0000');
  return el('p', { className: 'opened' }, [
    before,
    el('span', { className: 'open-count', textContent: n === undefined ? '…' : n === null ? '?' : String(n) }),
    after,
  ]);
}

// One row: title, class + date, "X of Y opened" with a bar, and buttons
function noticeRow(notice) {
  const link = `${location.origin}/n/${notice.id}`;
  const n = state.counts[notice.id];
  const bar = el('div', { className: 'bar-fill' });
  if (typeof n === 'number') bar.style.width = `${Math.min(100, Math.round((n / notice.students) * 100))}%`;
  const meter = el('div', { className: 'bar' }, [bar]);
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(notice.students));
  if (typeof n === 'number') {
    meter.setAttribute('aria-valuenow', String(n));
    meter.setAttribute('aria-label', t('opened', { n, total: notice.students }));
  }

  const open = el('a', { className: 'btn btn-secondary btn-small', href: link, target: '_blank', rel: 'noopener', textContent: t('open') });
  const copy = el('button', { className: 'btn btn-secondary btn-small', type: 'button', textContent: t('copyLink') });
  copy.addEventListener('click', () => copyLink(link, copy));
  const remove = el('button', { className: 'btn btn-secondary btn-small btn-danger', type: 'button', textContent: t('delete') });

  remove.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete', { title: titleOf(notice) }))) return;
    remove.disabled = true;
    try {
      await deleteNotice(notice.id);
      state.notices = state.notices.filter((x) => x.id !== notice.id);
      render();
    } catch (err) {
      console.error(err);
      remove.disabled = false;
      alert(t('errDelete'));
    }
  });

  return el('li', { className: 'card notice-row', lang: langInfo().htmlLang }, [
    el('h2', { textContent: titleOf(notice) }),
    el('p', { className: 'hint', textContent: [notice.className, formatDate(notice.createdAt)].filter(Boolean).join(' · ') }),
    openedLine(notice),
    meter,
    el('div', { className: 'date-actions' }, [open, copy, remove]),
  ]);
}

function render() {
  $('dash-empty').hidden = state.notices.length > 0;
  $('notice-list').replaceChildren(...state.notices.map(noticeRow));
}

async function loadDashboard() {
  try {
    state.notices = await myNotices();
    render();
    // Count each notice's opens at the same time, and redraw as each number arrives
    for (const notice of state.notices) {
      countViews(notice.id)
        .then((n) => (state.counts[notice.id] = n))
        .catch((err) => {
          console.error(err);
          state.counts[notice.id] = null;
        })
        .finally(render);
    }
  } catch (err) {
    console.error(err);
    $('dash-error').hidden = false;
  } finally {
    $('dash-loading').hidden = true;
  }
}

document.addEventListener('noto:language', render);
setupTeacherPage({ onSignedIn: loadDashboard });
