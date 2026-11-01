// POST /api/generate
// Body: { "text": "the notice..." }  or  { "image": { "mimeType": "image/jpeg", "data": "<base64>" } }
// Answer: { "notice": { school, original, languages: { en, hi, es, zh, vi }, warnings }, "model": "..." }
// On a problem: { "code": "unclear", "error": "A friendly message for the teacher" }

import { generateNotice } from './_lib/gemini.js';

const MAX_TEXT = 15000; // characters
const MIN_TEXT = 30;
const MAX_IMAGE_BASE64 = 4_000_000; // about 3 MB of photo
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Friendly messages the teacher sees. "detail" is the AI's own short reason, if any.
const MESSAGES = {
  empty: [400, () => 'Please paste the notice text or add a photo of it.'],
  too_short: [400, () => 'That text is very short. Please paste the whole notice.'],
  too_long: [400, () => 'That notice is too long (more than 15,000 characters). Please split it into two notices.'],
  bad_image: [400, () => 'Please upload a JPG, PNG or WebP photo.'],
  too_big: [413, () => 'That photo is too large. Please use a smaller photo (under 3 MB).'],
  unclear: [422, (d) => `We couldn't read this notice clearly, so we did not guess. ${d} Please try a sharper, well-lit photo, or paste the text instead.`],
  not_a_notice: [422, (d) => `This doesn't look like a school notice. ${d}`],
  blocked: [422, () => 'The AI could not process this notice. Please check the text and try again.'],
  busy: [503, () => 'The AI is busy right now (the free limit was reached). Please wait a minute and try again.'],
  timeout: [504, () => 'The AI took too long to answer. Please try again.'],
  bad_format: [502, () => 'The AI gave an incomplete answer. Please try again.'],
  network: [502, () => 'Could not reach the AI service. Please try again.'],
  ai_error: [502, () => 'The AI service had a problem. Please try again in a minute.'],
  server_key: [500, () => 'The AI is not set up correctly on the server (check the GEMINI_API_KEY setting).'],
};

function sendError(res, code, detail = '') {
  const [status, message] = MESSAGES[code] || MESSAGES.ai_error;
  res.status(status).json({ code, error: message(detail).replace(/\s+/g, ' ').trim() });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ code: 'method', error: 'Use POST.' });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    sendError(res, 'server_key');
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const image = body.image && typeof body.image === 'object' ? body.image : null;

  // Check the input before spending any AI quota on it
  if (!text && !image) return sendError(res, 'empty');
  if (text.length > MAX_TEXT) return sendError(res, 'too_long');
  if (!image && text.length < MIN_TEXT) return sendError(res, 'too_short');
  if (image) {
    if (!IMAGE_TYPES.includes(image.mimeType) || typeof image.data !== 'string' || !image.data) {
      return sendError(res, 'bad_image');
    }
    if (image.data.length > MAX_IMAGE_BASE64) return sendError(res, 'too_big');
    if (!/^[A-Za-z0-9+/]+=*$/.test(image.data)) return sendError(res, 'bad_image');
  }

  try {
    const { notice, model } = await generateNotice({ text, image: image && { mimeType: image.mimeType, data: image.data } });
    res.status(200).json({ notice, model });
  } catch (err) {
    console.error('[generate]', err.code, err.detail || err.message);
    sendError(res, err.code, err.detail);
  }
}
