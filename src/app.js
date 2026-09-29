const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/env');
const { isFirebaseEnabled, isStorageEnabled } = require('./config/firebase');
const { LOCAL_DIR } = require('./services/storage');
const openapi = require('./docs/openapi');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Allow locally stored photos to be embedded by a frontend on another origin
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use('/uploads', express.static(LOCAL_DIR));

app.get('/', (_req, res) => {
  res.json({ success: true, name: 'TownRate API', docs: '/api-docs', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    status: dbUp ? 'ok' : 'degraded',
    database: dbUp ? 'connected' : 'disconnected',
    firebaseAuth: isFirebaseEnabled() ? 'enabled' : 'disabled',
    photoStorage: isStorageEnabled() ? 'firebase' : 'local',
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api-docs.json', (_req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TownRate API Docs' }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
