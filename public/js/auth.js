// Noto — Firebase login and database, for the teacher pages only.
// (The parent page never loads Firebase, so it stays small and fast.)
// Firebase JavaScript SDK 12.19.0 from Google's official CDN.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
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

export async function signInWithGoogle() {
  const { auth } = await startFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
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

function signInErrorMessage(err) {
  switch (err.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/unauthorized-domain':
      return 'This website address is not allowed to sign in yet. (Firebase console → Authentication → Settings → Authorized domains.)';
    case 'auth/network-request-failed':
      return 'No internet connection. Please try again.';
    default:
      return 'Could not sign in. Please try again.';
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

  $('sign-in').addEventListener('click', async () => {
    $('auth-error').hidden = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      const message = signInErrorMessage(err);
      $('auth-error').textContent = message;
      $('auth-error').hidden = !message;
    }
  });

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
      console.error(err);
      $('auth-loading').textContent = `Teacher login is not available: ${err.message}`;
    });
}
