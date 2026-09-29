const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`[server] TownRate API listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`[server] docs at ${env.baseUrl}/api-docs`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
