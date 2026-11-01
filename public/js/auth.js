// Noto — Firebase login and database, for the teacher pages only.
// (The parent page never loads Firebase, so it stays small and fast.)
// Firebase JavaScript SDK 12.19.0 from Google's official CDN.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  deleteDoc,
  doc,
  getCount,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js';
import { setupLanguagePicker, t } from './teacher-i18n.js';

const $ = (id) => document.getElementById(id);

// ---------- Start Firebase (settings come from /api/config) ----------

let firebase;
function startFirebase() {
  firebase ??= (async () => {
    const res = await fetch('/api/config');
    const settings = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(settings.error || 'Firebase is not set up.');
    const app = initializeApp(settings);
    return { auth: getAuth(app), db: getFirestore(app) };
  })();
  return firebase;
}

// ---------- Login ----------

// Normally a small Google window (pop-up) opens. With { samePage: true } the whole tab goes to
// Google's sign-in page and comes back — for browsers and in-app browsers that block pop-ups.
export async function signInWithGoogle({ samePage = false } = {}) {
  const { auth } = await startFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (samePage) {
    await signInWithRedirect(auth, provider);
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Some phones block pop-ups: go to the Google page in the same tab instead
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

// Which message (from teacher-i18n.js) to show for a sign-in problem. "" = show nothing.
function signInErrorKey(err) {
  switch (err.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/unauthorized-domain':
      return 'errUnauthorizedDomain';
    case 'auth/network-request-failed':
      return 'errNetwork';
    default:
      return 'errSignIn';
  }
}

// A fresh login token for our own API (/api/generate checks it)
export async function loginToken() {
  const { auth } = await startFirebase();
  if (!auth.currentUser) throw new Error('Not signed in');
  return auth.currentUser.getIdToken();
}

async function currentTeacher() {
  const { auth, db } = await startFirebase();
  if (!auth.currentUser) throw new Error('Not signed in');
  return { uid: auth.currentUser.uid, db };
}

// ---------- Database ----------

// Saves a new notice. The security rules check that ownerId is really this teacher.
export async function saveNotice(notice) {
  const { uid, db } = await currentTeacher();
  const { id, ...fields } = notice;
  await setDoc(doc(db, 'notices', id), {
    ...fields,
    ownerId: uid,
    createdAt: serverTimestamp(),
    published: true,
  });
}

// All notices made by this teacher, newest first
export async function myNotices() {
  const { uid, db } = await currentTeacher();
  const snap = await getDocs(query(collection(db, 'notices'), where('ownerId', '==', uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

// How many different phones opened a notice. Counts on the server — it does not download the views.
export async function countViews(id) {
  const { db } = await currentTeacher();
  const snap = await getCount(collection(db, 'notices', id, 'views'));
  return snap.data().count;
}

export async function deleteNotice(id) {
  const { db } = await currentTeacher();
  await deleteDoc(doc(db, 'notices', id));
}

// ---------- Page setup shared by the teacher pages ----------
// Shows "Loading…", then either the sign-in card or the page itself.
// Calls onSignedIn(user) the first time a teacher is signed in.

export function setupTeacherPage({ onSignedIn }) {
  let started = false;
  let helpTimer;
  let errorKey = '';
  let loadFailed = false;

  setupLanguagePicker();

  const drawMessages = () => {
    $('auth-error').textContent = errorKey ? t(errorKey) : '';
    $('auth-error').hidden = !errorKey;
    if (loadFailed) $('auth-loading').textContent = t('loginUnavailable');
  };
  document.addEventListener('noto:language', drawMessages);

  const showSignInError = (err) => {
    console.error(err);
    errorKey = signInErrorKey(err);
    drawMessages();
  };

  $('sign-in').addEventListener('click', async () => {
    errorKey = '';
    drawMessages();
    $('sign-in-help').hidden = false;
    $('same-page-sign-in').hidden = true;
    // Some browsers block the pop-up without telling us. After a few seconds, offer the other way.
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => ($('same-page-sign-in').hidden = false), 4000);
    try {
      await signInWithGoogle();
    } catch (err) {
      showSignInError(err);
      $('same-page-sign-in').hidden = false;
    }
  });

  $('same-page-sign-in').addEventListener('click', () => signInWithGoogle({ samePage: true }).catch(showSignInError));

  // Coming back from Google's sign-in page: show an error if it failed (success is handled below)
  startFirebase()
    .then(({ auth }) => getRedirectResult(auth))
    .catch(showSignInError);

  $('sign-out').addEventListener('click', async () => {
    const { auth } = await startFirebase();
    await signOut(auth);
    location.reload();
  });

  startFirebase()
    .then(({ auth }) =>
      onAuthStateChanged(auth, (user) => {
        $('auth-loading').hidden = true;
        $('auth-gate').hidden = Boolean(user);
        $('app').hidden = !user;
        $('teacher-nav').hidden = !user;
        if (user) {
          $('teacher-name').textContent = user.displayName || user.email || '';
          if (!started) {
            started = true;
            onSignedIn(user);
          }
        }
      })
    )
    .catch((err) => {
      console.error(err); // the technical reason is in the browser console
      loadFailed = true;
      drawMessages();
    });
}
