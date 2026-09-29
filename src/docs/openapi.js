// OpenAPI 3 spec served at /api-docs (Swagger UI) and /api-docs.json.

const bearer = [{ bearerAuth: [] }];
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const idParam = (name = 'id', description = 'MongoDB ObjectId') => ({
  name, in: 'path', required: true, description, schema: { type: 'string' },
});
const q = (name, description, schema = { type: 'string' }, required = false) => ({
  name, in: 'query', required, description, schema,
});
const pageParams = [
  q('page', 'Page number', { type: 'integer', minimum: 1, default: 1 }),
  q('limit', 'Items per page (max 50)', { type: 'integer', minimum: 1, maximum: 50, default: 10 }),
];
const ok = (description, schema) => ({ description, content: schema ? json(schema) : undefined });
const err = (description) => ({ description, content: json(ref('Error')) });

const businessFields = {
  name: { type: 'string', example: 'Blue Tokai Coffee' },
  description: { type: 'string', example: 'Specialty coffee roasters' },
  category: { type: 'string', description: 'Category id, slug or name', example: 'cafe' },
  tags: { type: 'array', items: { type: 'string' }, example: ['coffee', 'wifi'] },
  address: {
    type: 'object',
    properties: {
      street: { type: 'string' }, city: { type: 'string', example: 'Mumbai' },
      state: { type: 'string' }, zip: { type: 'string' }, country: { type: 'string' },
    },
  },
  latitude: { type: 'number', example: 19.076 },
  longitude: { type: 'number', example: 72.8777 },
  phone: { type: 'string', example: '+91 98765 43210' },
  email: { type: 'string', format: 'email' },
  website: { type: 'string', format: 'uri' },
};

const businessBody = (required) => ({
  required: true,
  content: {
    'application/json': { schema: { type: 'object', required, properties: businessFields } },
    'multipart/form-data': {
      schema: {
        type: 'object',
        required,
        properties: {
          ...businessFields,
          'address[city]': { type: 'string', description: 'Use bracket notation for address fields in multipart' },
          tags: { type: 'string', description: 'Comma-separated in multipart', example: 'coffee,wifi' },
          photos: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Up to 5 images (jpeg/png/webp/gif)' },
        },
      },
    },
  },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'TownRate API',
    version: '1.0.0',
    description:
      'Local Business Review Platform. Authenticate with `POST /api/auth/login` (or `/api/auth/firebase`), ' +
      'then click **Authorize** and paste the token.\n\nRoles: `user` (reviews), `owner` (businesses, review responses), `admin` (everything, categories).',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Auth' }, { name: 'Businesses' }, { name: 'Photos' },
    { name: 'Reviews' }, { name: 'Categories' }, { name: 'System' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
      Pagination: {
        type: 'object',
        properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, pages: { type: 'integer' } },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' },
          role: { type: 'string', enum: ['user', 'owner', 'admin'] }, avatarUrl: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
        },
      },
      Category: {
        type: 'object',
        properties: {
          _id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
          description: { type: 'string' }, icon: { type: 'string' }, businessCount: { type: 'integer' },
        },
      },
      Photo: {
        type: 'object',
        properties: {
          _id: { type: 'string' }, url: { type: 'string' }, path: { type: 'string' },
          provider: { type: 'string', enum: ['firebase', 'local'] },
        },
      },
      Business: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          owner: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string' } } },
          name: { type: 'string' }, description: { type: 'string' },
          category: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' } } },
          tags: { type: 'array', items: { type: 'string' } },
          address: businessFields.address,
          location: {
            type: 'object',
            properties: { type: { type: 'string', example: 'Point' }, coordinates: { type: 'array', items: { type: 'number' }, example: [72.8777, 19.076] } },
          },
          phone: { type: 'string' }, email: { type: 'string' }, website: { type: 'string' },
          photos: { type: 'array', items: ref('Photo') },
          averageRating: { type: 'number', example: 4.5 }, reviewCount: { type: 'integer' },
          distanceKm: { type: 'number', description: 'Only on /near results' },
        },
      },
      Review: {
        type: 'object',
        properties: {
          _id: { type: 'string' }, business: { type: 'string' },
          user: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string' } } },
          rating: { type: 'integer', minimum: 1, maximum: 5 }, title: { type: 'string' }, comment: { type: 'string' },
          ownerResponse: { type: 'object', properties: { text: { type: 'string' }, respondedAt: { type: 'string', format: 'date-time' } } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: { tags: ['System'], summary: 'Health check (DB, Firebase status)', responses: { 200: ok('Healthy'), 503: ok('Database unavailable') } },
    },

    '/api/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Register with email and password',
        requestBody: {
          required: true,
          content: json({
            type: 'object', required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', example: 'Priya Sharma' }, email: { type: 'string', example: 'priya@example.com' },
              password: { type: 'string', minLength: 6, example: 'secret123' },
              role: { type: 'string', enum: ['user', 'owner'], default: 'user' },
            },
          }),
        },
        responses: { 201: ok('Registered', ref('AuthResult')), 409: err('Email taken'), 422: err('Validation failed') },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in, returns a JWT',
        requestBody: {
          required: true,
          content: json({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'priya@example.com' }, password: { type: 'string', example: 'secret123' } } }),
        },
        responses: { 200: ok('Logged in', ref('AuthResult')), 401: err('Invalid credentials') },
      },
    },
    '/api/auth/firebase': {
      post: {
        tags: ['Auth'], summary: 'Exchange a Firebase ID token for an app JWT',
        description: 'Verifies the token with Firebase Admin, links to an existing account by email or creates one.',
        requestBody: {
          required: true,
          content: json({ type: 'object', required: ['idToken'], properties: { idToken: { type: 'string' }, role: { type: 'string', enum: ['user', 'owner'] } } }),
        },
        responses: { 200: ok('Logged in', ref('AuthResult')), 201: ok('Account created', ref('AuthResult')), 401: err('Bad token'), 503: err('Firebase not configured') },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', security: bearer, responses: { 200: ok('User', { type: 'object', properties: { data: ref('User') } }), 401: err('Unauthenticated') } },
    },

    '/api/businesses': {
      get: {
        tags: ['Businesses'], summary: 'List businesses (filter by category / location)',
        parameters: [
          q('category', 'Category id, slug or name'), q('city', 'City (case-insensitive exact match)'),
          q('minRating', 'Minimum average rating', { type: 'number', minimum: 0, maximum: 5 }),
          q('owner', 'Owner id, or "me" (requires token)'),
          q('sort', 'Sort order', { type: 'string', enum: ['newest', 'oldest', 'rating', 'reviews', 'name'] }),
          ...pageParams,
        ],
        responses: { 200: ok('Businesses', { type: 'object', properties: { data: { type: 'array', items: ref('Business') }, pagination: ref('Pagination') } }) },
      },
      post: {
        tags: ['Businesses'], summary: 'Create a business profile (owner/admin)', security: bearer,
        requestBody: businessBody(['name', 'category', 'address']),
        responses: { 201: ok('Created', { type: 'object', properties: { data: ref('Business') } }), 401: err('Unauthenticated'), 403: err('Not an owner'), 422: err('Validation failed') },
      },
    },
    '/api/businesses/search': {
      get: {
        tags: ['Businesses'], summary: 'Search businesses by keyword',
        description: 'Case-insensitive partial match on name, description, tags, city and category name. At least one of keyword, category or city is required. Sorted by rating by default.',
        parameters: [
          q('keyword', 'Search text', { type: 'string', example: 'cafe' }), q('category', 'Category id, slug or name'),
          q('city', 'City'), q('minRating', 'Minimum rating', { type: 'number' }),
          q('sort', 'Sort order', { type: 'string', enum: ['rating', 'reviews', 'newest', 'oldest', 'name'] }), ...pageParams,
        ],
        responses: { 200: ok('Results', { type: 'object', properties: { data: { type: 'array', items: ref('Business') }, pagination: ref('Pagination') } }), 422: err('No search criteria') },
      },
    },
    '/api/businesses/near': {
      get: {
        tags: ['Businesses'], summary: '"Near me" geo search', description: 'Businesses within `radius` km of the point, nearest first, each with `distanceKm`.',
        parameters: [
          q('lat', 'Latitude', { type: 'number', example: 19.076 }, true), q('lng', 'Longitude', { type: 'number', example: 72.8777 }, true),
          q('radius', 'Radius in km (0.1-100)', { type: 'number', default: 5 }), q('category', 'Category id, slug or name'),
          q('minRating', 'Minimum rating', { type: 'number' }), q('limit', 'Max results (max 50)', { type: 'integer', default: 20 }),
        ],
        responses: { 200: ok('Nearby businesses', { type: 'object', properties: { data: { type: 'array', items: ref('Business') } } }), 422: err('Missing coordinates') },
      },
    },
    '/api/businesses/{id}': {
      get: { tags: ['Businesses'], summary: 'Get a business', parameters: [idParam()], responses: { 200: ok('Business', { type: 'object', properties: { data: ref('Business') } }), 404: err('Not found') } },
      put: {
        tags: ['Businesses'], summary: 'Update a business (its owner or admin)', security: bearer, parameters: [idParam()],
        description: 'Partial update. Photos sent as multipart are appended.',
        requestBody: businessBody([]),
        responses: { 200: ok('Updated', { type: 'object', properties: { data: ref('Business') } }), 403: err('Not the owner'), 404: err('Not found') },
      },
      delete: {
        tags: ['Businesses'], summary: 'Delete a business with its reviews and photos (owner/admin)', security: bearer, parameters: [idParam()],
        responses: { 200: ok('Deleted'), 403: err('Not the owner'), 404: err('Not found') },
      },
    },
    '/api/businesses/{id}/photos': {
      post: {
        tags: ['Photos'], summary: 'Upload photos (Firebase Storage)', security: bearer, parameters: [idParam()],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { photos: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: { 201: ok('All photos of the business', { type: 'object', properties: { data: { type: 'array', items: ref('Photo') } } }), 400: err('No file / bad type / too large') },
      },
    },
    '/api/businesses/{id}/photos/{photoId}': {
      delete: {
        tags: ['Photos'], summary: 'Delete a photo', security: bearer, parameters: [idParam(), idParam('photoId', 'Photo id')],
        responses: { 200: ok('Remaining photos'), 404: err('Not found') },
      },
    },

    '/api/reviews': {
      post: {
        tags: ['Reviews'], summary: 'Leave a review (one per user per business)', security: bearer,
        requestBody: {
          required: true,
          content: json({
            type: 'object', required: ['business', 'rating'],
            properties: {
              business: { type: 'string' }, rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
              title: { type: 'string', example: 'Great coffee' }, comment: { type: 'string', example: 'Loved the cold brew.' },
            },
          }),
        },
        responses: { 201: ok('Created', { type: 'object', properties: { data: ref('Review') } }), 403: err('Own business'), 404: err('Business not found'), 409: err('Already reviewed') },
      },
    },
    '/api/reviews/me': {
      get: { tags: ['Reviews'], summary: "Current user's reviews", security: bearer, parameters: pageParams, responses: { 200: ok('Reviews') } },
    },
    '/api/reviews/business/{id}': {
      get: {
        tags: ['Reviews'], summary: 'All reviews for a business, with star breakdown', parameters: [
          idParam('id', 'Business id'), q('sort', 'Sort order', { type: 'string', enum: ['newest', 'oldest', 'highest', 'lowest'] }), ...pageParams,
        ],
        responses: { 200: ok('Reviews', { type: 'object', properties: { data: { type: 'array', items: ref('Review') }, summary: { type: 'object' }, pagination: ref('Pagination') } }), 404: err('Business not found') },
      },
    },
    '/api/reviews/{id}': {
      put: {
        tags: ['Reviews'], summary: 'Edit your review', security: bearer, parameters: [idParam()],
        requestBody: { content: json({ type: 'object', properties: { rating: { type: 'integer' }, title: { type: 'string' }, comment: { type: 'string' } } }) },
        responses: { 200: ok('Updated'), 403: err('Not the author'), 404: err('Not found') },
      },
      delete: { tags: ['Reviews'], summary: 'Delete your review (or any, as admin)', security: bearer, parameters: [idParam()], responses: { 200: ok('Deleted'), 403: err('Not the author') } },
    },
    '/api/reviews/{id}/response': {
      post: {
        tags: ['Reviews'], summary: 'Business owner responds to a review (POST or PUT, upserts)', security: bearer, parameters: [idParam()],
        requestBody: { required: true, content: json({ type: 'object', required: ['text'], properties: { text: { type: 'string', example: 'Thanks for visiting!' } } }) },
        responses: { 200: ok('Review with response', { type: 'object', properties: { data: ref('Review') } }), 403: err('Not the business owner') },
      },
      put: {
        tags: ['Reviews'], summary: 'Same as POST', security: bearer, parameters: [idParam()],
        requestBody: { required: true, content: json({ type: 'object', required: ['text'], properties: { text: { type: 'string' } } }) },
        responses: { 200: ok('Review with response') },
      },
      delete: { tags: ['Reviews'], summary: 'Remove the owner response', security: bearer, parameters: [idParam()], responses: { 200: ok('Removed'), 404: err('No response') } },
    },

    '/api/categories': {
      get: { tags: ['Categories'], summary: 'List categories with business counts', responses: { 200: ok('Categories', { type: 'object', properties: { data: { type: 'array', items: ref('Category') } } }) } },
      post: {
        tags: ['Categories'], summary: 'Create category (admin)', security: bearer,
        requestBody: { required: true, content: json({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' } } }) },
        responses: { 201: ok('Created'), 403: err('Admin only'), 409: err('Duplicate') },
      },
    },
    '/api/categories/{id}': {
      put: {
        tags: ['Categories'], summary: 'Update category (admin)', security: bearer, parameters: [idParam()],
        requestBody: { content: json({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' } } }) },
        responses: { 200: ok('Updated') },
      },
      delete: { tags: ['Categories'], summary: 'Delete unused category (admin)', security: bearer, parameters: [idParam()], responses: { 200: ok('Deleted'), 409: err('In use') } },
    },
  },
};
