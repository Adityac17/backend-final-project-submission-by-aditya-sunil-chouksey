// Swagger UI loaded from a CDN. swagger-ui-express serves its assets from
// node_modules, which Vercel's function bundles don't include.
const router = require('express').Router();

const CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5';

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TownRate API Docs</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/swagger-ui-bundle.js"></script>
  <script src="/api-docs/init.js"></script>
</body>
</html>`;

// Separate file rather than an inline script so the default CSP can stay strict
const initJs = `window.ui = SwaggerUIBundle({
  url: '/api-docs.json',
  dom_id: '#swagger-ui',
  persistAuthorization: true,
});`;

router.get('/init.js', (_req, res) => res.type('application/javascript').send(initJs));
router.get('/', (_req, res) => res.type('html').send(html));

module.exports = router;
