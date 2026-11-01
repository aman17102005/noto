// Server-side Firebase helpers that use Google's plain web (REST) APIs — no extra packages.
// Settings come from environment variables, never from the code.

export function firebaseSettings() {
  // .trim() forgives a space pasted by accident before or after a value
  const env = (name) => (process.env[name] || '').trim();
  const settings = {
    apiKey: env('FIREBASE_API_KEY'),
    authDomain: env('FIREBASE_AUTH_DOMAIN'),
    projectId: env('FIREBASE_PROJECT_ID'),
    appId: env('FIREBASE_APP_ID'),
  };
  return Object.values(settings).every(Boolean) ? settings : null;
}

// ---------- Teacher login check ----------

// Checks the Firebase login token the teacher page sends ("Authorization: Bearer <token>").
// Google's accounts:lookup only accepts tokens from OUR project and only if they are valid
// and not expired. Returns the teacher's user ID, or null.
export async function verifyTeacher(req) {
  const settings = firebaseSettings();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!settings || !token) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(settings.apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

// ---------- Firestore (database) ----------

function documentsUrl(path) {
  const { projectId } = firebaseSettings();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

// The REST API wraps every value with its type, e.g. { "stringValue": "Hi" } or
// { "mapValue": { "fields": { ... } } }. This turns it back into normal JSON.
export function fromFirestore(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, fromFirestore(v)]));
  }
  return null;
}

// Reads a published notice as a visitor (no login). The security rules decide what is allowed.
// Returns the notice, or null if it does not exist / is not public.
export async function readPublicNotice(id) {
  const { apiKey } = firebaseSettings();
  const res = await fetch(`${documentsUrl(`notices/${id}`)}?key=${encodeURIComponent(apiKey)}`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Firestore read failed: HTTP ${res.status}`);
  const doc = await res.json();
  return fromFirestore({ mapValue: { fields: doc.fields } });
}

// Records one unique open: creates notices/{id}/views/{visitorId} with no data inside.
// If this phone already opened the notice, the document exists and Firestore says 409 — that is fine.
// Returns "counted", "already" or "rejected".
export async function addView(id, visitorId) {
  const { apiKey } = firebaseSettings();
  const url = `${documentsUrl(`notices/${id}/views`)}?documentId=${encodeURIComponent(visitorId)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"fields":{}}' });
  if (res.ok) return 'counted';
  if (res.status === 409) return 'already';
  return 'rejected';
}
