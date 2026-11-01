// Tests for the checks we run on the AI's answer. Run with:  npm test
// They use the demo notices as a "good" answer, then break them on purpose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkNotice, moneyAmounts } from '../api/_lib/notice-format.js';

function goodAnswer() {
  const demo = JSON.parse(readFileSync(new URL('../public/demo/demo-school.json', import.meta.url), 'utf8'));
  return { status: 'ok', problem: '', school: demo.school, original: demo.original, languages: demo.languages };
}

test('a good answer passes with no warnings', () => {
  const result = checkNotice(goodAnswer());
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.notice.languages), ['en', 'hi', 'es', 'zh', 'vi']);
  assert.deepEqual(result.notice.warnings, []);
});

test('"unclear" is passed on with the AI\'s reason', () => {
  const result = checkNotice({ status: 'unclear', problem: 'The bottom half of the photo is cut off.' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unclear');
  assert.match(result.detail, /cut off/);
});

test('a missing language is rejected', () => {
  const answer = goodAnswer();
  delete answer.languages.hi;
  const result = checkNotice(answer);
  assert.equal(result.code, 'bad_format');
  assert.match(result.detail, /^hi:/);
});

test('an empty checklist is rejected', () => {
  const answer = goodAnswer();
  answer.languages.vi.checklist = ['  '];
  assert.equal(checkNotice(answer).code, 'bad_format');
});

test('calendar dates are copied from English so every language matches', () => {
  const answer = goodAnswer();
  answer.languages.es.dates[0].iso = '2026-12-08'; // AI made a mistake in Spanish
  const result = checkNotice(answer);
  assert.equal(result.ok, true);
  assert.equal(result.notice.languages.es.dates[0].iso, '2026-12-07');
});

test('a wrong date format is dropped instead of breaking the calendar', () => {
  const answer = goodAnswer();
  answer.languages.en.dates[0].iso = '7 Dec 2026';
  answer.languages.en.dates[1].start = '6:30 AM';
  const result = checkNotice(answer);
  assert.equal(result.notice.languages.en.dates[0].iso, '');
  assert.equal(result.notice.languages.en.dates[1].start, '');
});

test('a money amount that is not in the original creates a warning', () => {
  const answer = goodAnswer();
  answer.languages.hi.summary = answer.languages.hi.summary.replace('₹450', '₹540');
  const result = checkNotice(answer);
  assert.equal(result.ok, true);
  assert.equal(result.notice.warnings.length, 1);
  assert.equal(result.notice.warnings[0].lang, 'hi');
});

test('money amounts are found in different styles', () => {
  assert.deepEqual([...moneyAmounts('Pay ₹450 or Rs. 1,200 or $25.00 or 300 €')], ['450', '1200', '2500', '300']);
  assert.deepEqual([...moneyAmounts('Come at 5 hours 30 minutes')], []);
});
