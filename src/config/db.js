const mongoose = require('mongoose');
const env = require('./env');

// Shared across calls so serverless invocations (Vercel) reuse one connection
// instead of opening a new one per request.
let connecting = null;

async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    mongoose.set('strictQuery', true);
    connecting = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 })
      .then(() => {
        if (env.nodeEnv !== 'test') {
          console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
        }
        return mongoose.connection;
      })
      .catch((err) => {
        connecting = null;
        throw err;
      });
  }
  return connecting;
}

async function disconnectDB() {
  connecting = null;
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
