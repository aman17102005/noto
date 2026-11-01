// GET /api/config
// Gives the teacher pages the Firebase web settings, read from environment variables.
// These values are designed to be used in browsers (Google's docs say they are not secret —
// the security rules protect the data), but keeping them out of the code means the repo
// contains no keys at all and a new deployment just needs its own environment variables.

import { firebaseSettings } from './_lib/firebase.js';

export default function handler(req, res) {
  const settings = firebaseSettings();
  if (!settings) {
    res.status(500).json({ error: 'Firebase is not set up yet (missing FIREBASE_* environment variables).' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(settings);
}
