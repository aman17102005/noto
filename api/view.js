// POST /api/view   body: { "id": "k7m2xq9p", "visitor": "<random ID made on the parent's phone>" }
// Counts one unique open. The visitor ID is random and stored only on that phone —
// no name, no phone number, no IP address is saved. Same phone twice = still one open.

import { firebaseSettings, addView } from './_lib/firebase.js';

const ID_PATTERN = /^[a-z0-9]{8,32}$/;
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(body.id || '');
  const visitor = String(body.visitor || '');
  if (!ID_PATTERN.test(id) || !VISITOR_PATTERN.test(visitor)) {
    res.status(400).json({ error: 'Bad request.' });
    return;
  }
  if (!firebaseSettings()) {
    res.status(500).json({ error: 'The database is not set up yet.' });
    return;
  }

  try {
    const result = await addView(id, visitor);
    res.status(result === 'rejected' ? 404 : 200).json({ result });
  } catch (err) {
    console.error('[view]', err.message);
    res.status(502).json({ error: 'Could not count the view.' });
  }
}
