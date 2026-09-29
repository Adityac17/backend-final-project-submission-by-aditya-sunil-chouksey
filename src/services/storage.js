const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const { getFirebaseApp, isStorageEnabled } = require('../config/firebase');
const ApiError = require('../utils/ApiError');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads');

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function buildKey(folder, file) {
  const ext = EXT_BY_TYPE[file.mimetype] || path.extname(file.originalname) || '';
  return `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

async function uploadToFirebase(file, key) {
  const bucket = getFirebaseApp().storage().bucket();
  const token = crypto.randomUUID();
  await bucket.file(key).save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: file.mimetype,
      // Download token gives a stable public URL without making the bucket public
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(key)}?alt=media&token=${token}`;
  return { url, path: key, provider: 'firebase' };
}

async function uploadToLocal(file, key) {
  const dest = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, file.buffer);
  return { url: `${env.baseUrl}/uploads/${key}`, path: key, provider: 'local' };
}

// 'firebase', 'local', or 'unavailable' (serverless without Firebase)
function storageMode() {
  if (isStorageEnabled()) return 'firebase';
  return env.isServerless ? 'unavailable' : 'local';
}

async function uploadFile(file, folder) {
  const key = buildKey(folder, file);
  const mode = storageMode();
  if (mode === 'unavailable') {
    throw new ApiError(503, 'Photo uploads need Firebase Storage configured on this deployment');
  }
  return mode === 'firebase' ? uploadToFirebase(file, key) : uploadToLocal(file, key);
}

function uploadFiles(files = [], folder) {
  return Promise.all(files.map((f) => uploadFile(f, folder)));
}

// Best effort: a missing file should not fail the request that removes it.
async function deleteFile(photo) {
  try {
    if (photo.provider === 'firebase' && isStorageEnabled()) {
      await getFirebaseApp().storage().bucket().file(photo.path).delete({ ignoreNotFound: true });
    } else if (photo.provider === 'local') {
      const target = path.resolve(LOCAL_DIR, photo.path);
      if (target.startsWith(LOCAL_DIR + path.sep)) await fs.rm(target, { force: true });
    }
  } catch (err) {
    console.warn(`[storage] could not delete ${photo.path}: ${err.message}`);
  }
}

module.exports = { uploadFile, uploadFiles, deleteFile, storageMode, LOCAL_DIR };
