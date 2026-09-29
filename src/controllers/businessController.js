const mongoose = require('mongoose');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Review = require('../models/Review');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const storage = require('../services/storage');
const {
  escapeRegex,
  getPagination,
  buildPaginationMeta,
  getSort,
} = require('../utils/query');

const POPULATE = [
  { path: 'category', select: 'name slug icon' },
  { path: 'owner', select: 'name' },
];

const UPDATABLE = ['name', 'description', 'tags', 'phone', 'email', 'website'];
const ADDRESS_FIELDS = ['street', 'city', 'state', 'zip', 'country'];

// Accepts a category id, slug or name.
async function resolveCategory(value) {
  const v = String(value).trim();
  const filter = mongoose.isValidObjectId(v)
    ? { _id: v }
    : { $or: [{ slug: v.toLowerCase() }, { name: new RegExp(`^${escapeRegex(v)}$`, 'i') }] };
  const category = await Category.findOne(filter);
  if (!category) throw ApiError.badRequest(`Unknown category: ${v}`);
  return category;
}

// Same as above but for query filters: returns the id, or null if the category doesn't exist.
async function findCategoryId(value) {
  try {
    return (await resolveCategory(value))._id;
  } catch {
    return null;
  }
}

async function loadOwnedBusiness(req) {
  const business = await Business.findById(req.params.id);
  if (!business) throw ApiError.notFound('Business not found');
  const isOwner = business.owner.equals(req.user._id);
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('Only the business owner can modify this business');
  }
  return business;
}

function applyFields(business, body) {
  for (const key of UPDATABLE) {
    if (body[key] !== undefined) business[key] = body[key];
  }
  if (body.address && typeof body.address === 'object') {
    for (const key of ADDRESS_FIELDS) {
      if (body.address[key] !== undefined) business.set(`address.${key}`, body.address[key]);
    }
  }
  if (body.latitude !== undefined && body.latitude !== '' && body.longitude !== undefined && body.longitude !== '') {
    business.location = { type: 'Point', coordinates: [Number(body.longitude), Number(body.latitude)] };
  }
}

// Upload request files and attach them. If saving fails, roll back the uploads.
async function saveWithPhotos(business, files = []) {
  if (business.photos.length + files.length > env.maxPhotosPerBusiness) {
    throw ApiError.badRequest(`A business can have at most ${env.maxPhotosPerBusiness} photos`);
  }
  await business.validate();
  const uploaded = await storage.uploadFiles(files, `businesses/${business._id}`);
  business.photos.push(...uploaded);
  try {
    await business.save();
  } catch (err) {
    await Promise.all(uploaded.map(storage.deleteFile));
    throw err;
  }
  return business.populate(POPULATE);
}

async function buildFilters(q, user) {
  const filter = {};
  if (q.category) {
    const id = await findCategoryId(q.category);
    // Unknown category: force an empty result rather than ignoring the filter
    filter.category = id || new mongoose.Types.ObjectId();
  }
  if (q.city) filter['address.city'] = new RegExp(`^${escapeRegex(q.city.trim())}$`, 'i');
  if (q.minRating !== undefined) filter.averageRating = { $gte: Number(q.minRating) };
  if (q.owner) {
    if (q.owner === 'me') {
      if (!user) throw ApiError.unauthorized('Log in to list your own businesses');
      filter.owner = user._id;
    } else {
      filter.owner = q.owner;
    }
  }
  return filter;
}

async function paginatedFind(res, filter, query) {
  const { page, limit, skip } = getPagination(query);
  const [items, total] = await Promise.all([
    Business.find(filter).sort(getSort(query.sort)).skip(skip).limit(limit).populate(POPULATE),
    Business.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, pagination: buildPaginationMeta(total, page, limit) });
}

// GET /api/businesses?category=&city=&minRating=&owner=&sort=&page=&limit=
async function listBusinesses(req, res) {
  const filter = await buildFilters(req.query, req.user);
  await paginatedFind(res, filter, req.query);
}

// GET /api/businesses/search?keyword=cafe&category=&city=&minRating=
// Case-insensitive partial match on name, description, tags, city and category name.
async function searchBusinesses(req, res) {
  const filter = await buildFilters(req.query, req.user);
  const keyword = (req.query.keyword || '').trim();

  if (keyword) {
    const rx = new RegExp(escapeRegex(keyword), 'i');
    const matchingCategories = await Category.find({ name: rx }).select('_id').lean();
    filter.$or = [
      { name: rx },
      { description: rx },
      { tags: rx },
      { 'address.city': rx },
      { category: { $in: matchingCategories.map((c) => c._id) } },
    ];
  }

  await paginatedFind(res, filter, { sort: 'rating', ...req.query });
}

// GET /api/businesses/near?lat=&lng=&radius=5&category=&limit=
// Sorted by distance; each result includes distanceKm.
// Express 5 exposes req.query as a read-only getter, so validator sanitizers
// can't coerce it in place - convert here instead.
async function nearBusinesses(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Number(req.query.radius) || 5;
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);

  const query = {};
  if (req.query.category) {
    query.category = (await findCategoryId(req.query.category)) || new mongoose.Types.ObjectId();
  }
  if (req.query.minRating) query.averageRating = { $gte: Number(req.query.minRating) };

  const results = await Business.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query,
      },
    },
    { $limit: limit },
    { $addFields: { distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] } } },
    { $project: { distanceMeters: 0, __v: 0 } },
  ]);
  await Business.populate(results, POPULATE);

  res.json({
    success: true,
    data: results,
    meta: { center: { lat, lng }, radiusKm, count: results.length },
  });
}

// GET /api/businesses/:id
async function getBusiness(req, res) {
  const business = await Business.findById(req.params.id).populate(POPULATE);
  if (!business) throw ApiError.notFound('Business not found');
  res.json({ success: true, data: business });
}

// POST /api/businesses  (owner/admin, JSON or multipart with "photos")
async function createBusiness(req, res) {
  const category = await resolveCategory(req.body.category);
  const business = new Business({ owner: req.user._id, category: category._id });
  applyFields(business, req.body);
  await saveWithPhotos(business, req.files);
  res.status(201).json({ success: true, data: business });
}

// PUT /api/businesses/:id  (owner/admin; multipart "photos" are appended)
async function updateBusiness(req, res) {
  const business = await loadOwnedBusiness(req);
  if (req.body.category) business.category = (await resolveCategory(req.body.category))._id;
  applyFields(business, req.body);
  await saveWithPhotos(business, req.files);
  res.json({ success: true, data: business });
}

// DELETE /api/businesses/:id  (owner/admin) - also removes its reviews and photos
async function deleteBusiness(req, res) {
  const business = await loadOwnedBusiness(req);
  await Review.deleteMany({ business: business._id });
  await business.deleteOne();
  await Promise.all(business.photos.map(storage.deleteFile));
  res.json({ success: true, message: 'Business deleted' });
}

// POST /api/businesses/:id/photos  (owner/admin)
async function addPhotos(req, res) {
  if (!req.files || req.files.length === 0) {
    throw ApiError.badRequest('Attach at least one image in the "photos" field');
  }
  const business = await loadOwnedBusiness(req);
  await saveWithPhotos(business, req.files);
  res.status(201).json({ success: true, data: business.photos });
}

// DELETE /api/businesses/:id/photos/:photoId  (owner/admin)
async function deletePhoto(req, res) {
  const business = await loadOwnedBusiness(req);
  const photo = business.photos.id(req.params.photoId);
  if (!photo) throw ApiError.notFound('Photo not found');
  const removed = photo.toObject();
  photo.deleteOne();
  await business.save();
  await storage.deleteFile(removed);
  res.json({ success: true, data: business.photos });
}

module.exports = {
  listBusinesses,
  searchBusinesses,
  nearBusinesses,
  getBusiness,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  addPhotos,
  deletePhoto,
};
