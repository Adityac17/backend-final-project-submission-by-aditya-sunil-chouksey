require('dotenv').config({ quiet: true });

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 5000}`,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/townrate',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
    credentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  },
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 5,
  maxPhotosPerBusiness: Number(process.env.MAX_PHOTOS_PER_BUSINESS) || 10,
  // Vercel functions have a read-only filesystem, so local photo storage is unavailable
  isServerless: Boolean(process.env.VERCEL),
};

if (!env.jwtSecret) {
  if (env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  env.jwtSecret = 'dev-only-insecure-secret';
  if (env.nodeEnv !== 'test') {
    console.warn('[config] JWT_SECRET not set - using an insecure development secret');
  }
}

module.exports = env;
