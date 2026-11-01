// Tests for turning Firestore's typed REST format back into normal JSON. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFirestore } from '../api/_lib/firebase.js';

test('typed Firestore values become plain JSON', () => {
  const restDocument = {
    mapValue: {
      fields: {
        className: { stringValue: 'Class 6B' },
        students: { integerValue: '45' },
        published: { booleanValue: true },
        createdAt: { timestampValue: '2026-11-02T10:00:00Z' },
        languages: {
          mapValue: {
            fields: {
              en: {
                mapValue: {
                  fields: {
                    title: { stringValue: 'Trip' },
                    checklist: { arrayValue: { values: [{ stringValue: 'Sign the form' }, { stringValue: 'Pay ₹450' }] } },
                    dates: { arrayValue: {} },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  assert.deepEqual(fromFirestore(restDocument), {
    className: 'Class 6B',
    students: 45,
    published: true,
    createdAt: '2026-11-02T10:00:00Z',
    languages: { en: { title: 'Trip', checklist: ['Sign the form', 'Pay ₹450'], dates: [] } },
  });
});
