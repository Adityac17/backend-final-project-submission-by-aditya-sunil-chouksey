const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILES_PER_REQUEST = 5;

// Files stay in memory; the storage service decides whether they go to Firebase or disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`Unsupported file type ${file.mimetype}. Allowed: ${ALLOWED_TYPES.join(', ')}`));
  },
});

const uploadPhotos = upload.array('photos', MAX_FILES_PER_REQUEST);

module.exports = { uploadPhotos, ALLOWED_TYPES, MAX_FILES_PER_REQUEST };
