// Noto — teacher dashboard: every notice with "X of Y opened".

import { setupTeacherPage, myNotices, countViews, deleteNotice } from './auth.js';

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function formatDate(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

async function copyLink(link, button) {
  try {
    await navigator.clipboard.writeText(link);
    button.textContent = 'Copied ✓';
  } catch {
    prompt('Copy this link:', link);
  }
  setTimeout(() => (button.textContent = 'Copy link'), 2000);
}

// One row: title, class + date, "X of Y opened" with a bar, and buttons
function noticeRow(notice) {
  const link = `${location.origin}/n/${notice.id}`;
  const count = el('span', { className: 'open-count', textContent: '…' });
  const bar = el('div', { className: 'bar-fill' });
  const meter = el('div', { className: 'bar' }, [bar]);
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(notice.students));

  const open = el('a', { className: 'btn btn-secondary btn-small', href: link, target: '_blank', rel: 'noopener', textContent: 'Open ↗' });
  const copy = el('button', { className: 'btn btn-secondary btn-small', type: 'button', textContent: 'Copy link' });
  copy.addEventListener('click', () => copyLink(link, copy));
  const remove = el('button', { className: 'btn btn-secondary btn-small btn-danger', type: 'button', textContent: 'Delete' });

  const row = el('li', { className: 'card notice-row' }, [
    el('h2', { textContent: notice.languages?.en?.title || '(no title)' }),
    el('p', { className: 'hint', textContent: [notice.className, formatDate(notice.createdAt)].filter(Boolean).join(' · ') }),
    el('p', { className: 'opened' }, [count, ` of ${notice.students} opened`]),
    meter,
    el('div', { className: 'date-actions' }, [open, copy, remove]),
  ]);

  remove.addEventListener('click', async () => {
    if (!confirm(`Delete "${notice.languages?.en?.title}"? Parents will no longer be able to open it.`)) return;
    remove.disabled = true;
    try {
      await deleteNotice(notice.id);
      row.remove();
      if (!$('notice-list').children.length) $('dash-empty').hidden = false;
    } catch (err) {
      console.error(err);
      remove.disabled = false;
      alert('Could not delete the notice. Please try again.');
    }
  });

  // Fill in the count when it arrives (each notice is counted separately, all at the same time)
  countViews(notice.id)
    .then((n) => {
      count.textContent = String(n);
      bar.style.width = `${Math.min(100, Math.round((n / notice.students) * 100))}%`;
      meter.setAttribute('aria-valuenow', String(n));
      meter.setAttribute('aria-label', `${n} of ${notice.students} opened`);
    })
    .catch((err) => {
      console.error(err);
      count.textContent = '?';
    });

  return row;
}

async function loadDashboard() {
  try {
    const notices = await myNotices();
    $('dash-empty').hidden = notices.length > 0;
    $('notice-list').replaceChildren(...notices.map(noticeRow));
  } catch (err) {
    console.error(err);
    $('dash-error').textContent = 'Could not load your notices. Please check your internet and refresh the page.';
    $('dash-error').hidden = false;
  } finally {
    $('dash-loading').hidden = true;
  }
}

setupTeacherPage({ onSignedIn: loadDashboard });
