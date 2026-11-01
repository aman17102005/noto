// Tests that every page text exists in all 5 languages, and that Hindi and Chinese
// texts contain no English words. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../public/js/teacher-i18n.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();

// Brand names that are written this way in every language
const ALLOWED_LATIN = ['WhatsApp', 'Noto'];

function englishWordsIn(text) {
  let rest = text.replace(/\{\w+\}/g, '');
  for (const word of ALLOWED_LATIN) rest = rest.replaceAll(word, '');
  return rest.match(/[A-Za-z]{2,}/g) || [];
}

// The parent page is a plain script, so read its LANGS object straight from the file
function parentPageLanguages() {
  const source = read('public/js/notice.js');
  const start = source.indexOf('const LANGS = {');
  const end = source.indexOf('\n};', start);
  return new Function(`${source.slice(start, end + 3)} return LANGS;`)();
}

test('teacher pages: every language has exactly the same texts as English', () => {
  const english = Object.keys(STRINGS.en).sort();
  for (const [lang, texts] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(texts).sort(), english, `${lang} is missing or has extra texts`);
    for (const key of english) {
      assert.deepEqual(placeholders(texts[key]), placeholders(STRINGS.en[key]), `${lang}.${key} has different {blanks}`);
    }
  }
});

test('teacher pages: every text the pages ask for exists', () => {
  const html = read('public/teacher.html') + read('public/dashboard.html');
  const js = read('public/js/teacher.js') + read('public/js/auth.js') + read('public/js/dashboard.js');
  const used = new Set([
    ...[...html.matchAll(/data-(?:i18n(?:-placeholder|-aria-label|-alt)?|title-key)="(\w+)"/g)].map((m) => m[1]),
    ...[...js.matchAll(/\bt\('(\w+)'/g)].map((m) => m[1]),
    ...[...js.matchAll(/showError\('[\w-]+', '(\w+)'/g)].map((m) => m[1]),
    ...[...js.matchAll(/(?:return|key =|:) '(err\w+|api_\w+)'/g)].map((m) => m[1]),
  ]);
  for (const key of used) assert.ok(key in STRINGS.en, `"${key}" is used but has no text`);
});

test('teacher pages: no English words in Hindi or Chinese', () => {
  for (const lang of ['hi', 'zh']) {
    for (const [key, text] of Object.entries(STRINGS[lang])) {
      assert.deepEqual(englishWordsIn(text), [], `${lang}.${key}: "${text}"`);
    }
  }
});

test('parent page: every language has the same texts, with no English in Hindi or Chinese', () => {
  const langs = parentPageLanguages();
  const english = Object.keys(langs.en.ui).sort();
  for (const [lang, { ui }] of Object.entries(langs)) {
    assert.deepEqual(Object.keys(ui).sort(), english, `${lang} is missing parent page texts`);
  }
  for (const lang of ['hi', 'zh']) {
    for (const [key, text] of Object.entries(langs[lang].ui)) {
      assert.deepEqual(englishWordsIn(text), [], `parent page ${lang}.${key}: "${text}"`);
    }
  }
});
