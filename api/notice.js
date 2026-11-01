// GET /api/notice?id=k7m2xq9p
// Used by the parent page. Returns only what parents need — never the teacher's user ID.

import { firebaseSettings, readPublicNotice } from './_lib/firebase.js';

const ID_PATTERN = /^[a-z0-9]{8,32}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  const id = String(req.query.id || '');
  if (!ID_PATTERN.test(id)) {
    res.status(404).json({ error: 'Notice not found.' });
    return;
  }
  if (!firebaseSettings()) {
    res.status(500).json({ error: 'The database is not set up yet.' });
    return;
  }

  try {
    const notice = await readPublicNotice(id);
    if (!notice || notice.published !== true) {
      res.status(404).json({ error: 'Notice not found.' });
      return;
    }
    // Short cache: fast for 40 parents opening at once, but teacher edits still show within a minute
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    res.status(200).json({
      id,
      school: notice.school || '',
      audience: notice.audience || null,
      className: notice.className || '', // notices made before "audience" existed
      createdAt: notice.createdAt || '',
      original: notice.original || '',
      languages: notice.languages || {},
    });
  } catch (err) {
    console.error('[notice]', err.message);
    res.status(502).json({ error: 'Could not load the notice. Please try again.' });
  }
}
