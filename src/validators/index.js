const { body, param, query } = require('express-validator');

const objectId = (field, location = param) =>
  location(field).isMongoId().withMessage(`${field} must be a valid id`);

// Accept "a,b,c" (multipart forms) or a real array (JSON).
const toArray = (v) => {
  if (v === undefined || v === null || v === '') return [];
  return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
};

const auth = {
  register: [
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 80 }),
    body('email').trim().isEmail().withMessage('valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
    body('role').optional().isIn(['user', 'owner']).withMessage('role must be user or owner'),
  ],
  login: [
    body('email').trim().isEmail().withMessage('valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('password is required'),
  ],
  firebase: [
    body('idToken').notEmpty().withMessage('idToken is required'),
    body('role').optional().isIn(['user', 'owner']).withMessage('role must be user or owner'),
  ],
};

const coordinates = [
  body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('latitude must be between -90 and 90').toFloat(),
  body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('longitude must be between -180 and 180').toFloat(),
  body('longitude').custom((lng, { req }) => {
    const hasLat = req.body.latitude !== undefined && req.body.latitude !== '';
    const hasLng = lng !== undefined && lng !== '';
    if (hasLat !== hasLng) throw new Error('latitude and longitude must be provided together');
    return true;
  }),
];

const businessOptionalFields = [
  body('description').optional().isString().isLength({ max: 2000 }),
  body('tags').optional().customSanitizer(toArray).isArray({ max: 20 }).withMessage('at most 20 tags'),
  body('phone').optional({ values: 'falsy' }).matches(/^[+\d][\d\s()-]{5,19}$/).withMessage('invalid phone number'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('invalid email'),
  body('website').optional({ values: 'falsy' }).isURL().withMessage('invalid website URL'),
  ...coordinates,
];

const business = {
  create: [
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 120 }),
    body('category').trim().notEmpty().withMessage('category (id or slug) is required'),
    body('address.city').trim().notEmpty().withMessage('address.city is required'),
    ...businessOptionalFields,
  ],
  update: [
    objectId('id'),
    body('name').optional().trim().notEmpty().isLength({ max: 120 }),
    body('category').optional().trim().notEmpty(),
    body('address.city').optional().trim().notEmpty().withMessage('address.city cannot be empty'),
    body('owner').not().exists().withMessage('owner cannot be changed'),
    body(['averageRating', 'reviewCount']).not().exists().withMessage('rating fields are computed and cannot be set'),
    ...businessOptionalFields,
  ],
  id: [objectId('id')],
  photo: [objectId('id'), objectId('photoId')],
  list: [
    query('minRating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('sort').optional().isIn(['rating', 'reviews', 'newest', 'oldest', 'name']),
    query('owner').optional().custom((v) => v === 'me' || /^[a-f\d]{24}$/i.test(v)).withMessage('owner must be an id or "me"'),
  ],
  search: [
    query('keyword').optional().trim().isLength({ max: 100 }),
    query('minRating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('keyword').custom((kw, { req }) => {
      if (!kw && !req.query.category && !req.query.city) {
        throw new Error('provide at least one of keyword, category or city');
      }
      return true;
    }),
  ],
  near: [
    query('lat').exists().withMessage('lat is required').isFloat({ min: -90, max: 90 }).toFloat(),
    query('lng').exists().withMessage('lng is required').isFloat({ min: -180, max: 180 }).toFloat(),
    query('radius').optional().isFloat({ min: 0.1, max: 100 }).withMessage('radius must be 0.1-100 km').toFloat(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
};

const review = {
  create: [
    body('business').isMongoId().withMessage('business must be a valid id'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be an integer 1-5').toInt(),
    body('title').optional().trim().isLength({ max: 120 }),
    body('comment').optional().trim().isLength({ max: 2000 }),
  ],
  update: [
    objectId('id'),
    body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('rating must be an integer 1-5').toInt(),
    body('title').optional().trim().isLength({ max: 120 }),
    body('comment').optional().trim().isLength({ max: 2000 }),
  ],
  id: [objectId('id')],
  forBusiness: [
    objectId('id'),
    query('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  respond: [
    objectId('id'),
    body('text').trim().notEmpty().withMessage('text is required').isLength({ max: 1000 }),
  ],
};

const category = {
  create: [
    body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 50 }),
    body('description').optional().trim().isLength({ max: 200 }),
    body('icon').optional().trim(),
  ],
  update: [
    objectId('id'),
    body('name').optional().trim().notEmpty().isLength({ max: 50 }),
    body('description').optional().trim().isLength({ max: 200 }),
    body('icon').optional().trim(),
  ],
  id: [objectId('id')],
};

module.exports = { auth, business, review, category, toArray };
