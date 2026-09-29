const env = require('./env');

// Firebase is optional. When credentials are missing the app still runs:
// photos go to local disk and the Firebase login exchange is disabled.
let app = null;
let initialised = false;

function getFirebaseApp() {
  if (initialised) return app;
  initialised = true;

  const { projectId, clientEmail, privateKey, credentialsFile, storageBucket } = env.firebase;
  const hasInlineCreds = projectId && clientEmail && privateKey;
  if (!hasInlineCreds && !credentialsFile) return null;

  try {
    const admin = require('firebase-admin');
    const credential = hasInlineCreds
      ? admin.credential.cert({ projectId, clientEmail, privateKey })
      : admin.credential.applicationDefault();
    app = admin.initializeApp({ credential, storageBucket });
    console.log('[firebase] initialised');
  } catch (err) {
    console.error('[firebase] failed to initialise, continuing without it:', err.message);
    app = null;
  }
  return app;
}

function isFirebaseEnabled() {
  return getFirebaseApp() !== null;
}

function isStorageEnabled() {
  return isFirebaseEnabled() && Boolean(env.firebase.storageBucket);
}

module.exports = { getFirebaseApp, isFirebaseEnabled, isStorageEnabled };
