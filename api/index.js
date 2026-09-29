// Vercel serverless entry. vercel.json rewrites every path here; the Express
// app then routes on the original URL. Render and local dev use src/server.js.
const app = require('../src/app');
const { connectDB } = require('../src/config/db');

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Database unavailable' }));
    return;
  }
  app(req, res);
};
