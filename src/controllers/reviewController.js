const mongoose = require('mongoose');
const Review = require('../models/Review');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/query');

const REVIEW_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
};

const POPULATE_USER = { path: 'user', select: 'name avatarUrl' };

async function loadReview(id) {
  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('Review not found');
  return review;
}

// POST /api/reviews
async function createReview(req, res) {
  const { business: businessId, rating, title, comment } = req.body;
  const business = await Business.findById(businessId).select('owner');
  if (!business) throw ApiError.notFound('Business not found');
  if (business.owner.equals(req.user._id)) {
    throw ApiError.forbidden('You cannot review your own business');
  }
  if (await Review.exists({ business: businessId, user: req.user._id })) {
    throw ApiError.conflict('You have already reviewed this business. Update your existing review instead.');
  }

  const review = await Review.create({ business: businessId, user: req.user._id, rating, title, comment });
  const stats = await Review.syncBusinessRating(businessId);
  await review.populate(POPULATE_USER);
  res.status(201).json({ success: true, data: review, businessRating: stats });
}

// GET /api/reviews/business/:id?sort=&page=&limit=
// Includes a star breakdown for the whole business, not just the current page.
async function getBusinessReviews(req, res) {
  const businessId = req.params.id;
  const business = await Business.findById(businessId).select('name averageRating reviewCount');
  if (!business) throw ApiError.notFound('Business not found');

  const { page, limit, skip } = getPagination(req.query);
  const filter = { business: businessId };
  const [reviews, total, breakdownAgg] = await Promise.all([
    Review.find(filter)
      .sort(REVIEW_SORTS[req.query.sort] || REVIEW_SORTS.newest)
      .skip(skip)
      .limit(limit)
      .populate(POPULATE_USER),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { business: new mongoose.Types.ObjectId(businessId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of breakdownAgg) breakdown[row._id] = row.count;

  res.json({
    success: true,
    data: reviews,
    summary: {
      business: { _id: business._id, name: business.name },
      averageRating: business.averageRating,
      reviewCount: business.reviewCount,
      breakdown,
    },
    pagination: buildPaginationMeta(total, page, limit),
  });
}

// GET /api/reviews/me
async function getMyReviews(req, res) {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { user: req.user._id };
  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('business', 'name averageRating'),
    Review.countDocuments(filter),
  ]);
  res.json({ success: true, data: reviews, pagination: buildPaginationMeta(total, page, limit) });
}

// PUT /api/reviews/:id  (author only)
async function updateReview(req, res) {
  const review = await loadReview(req.params.id);
  if (!review.user.equals(req.user._id)) throw ApiError.forbidden('You can only edit your own review');

  for (const key of ['rating', 'title', 'comment']) {
    if (req.body[key] !== undefined) review[key] = req.body[key];
  }
  await review.save();
  const stats = await Review.syncBusinessRating(review.business);
  await review.populate(POPULATE_USER);
  res.json({ success: true, data: review, businessRating: stats });
}

// DELETE /api/reviews/:id  (author or admin)
async function deleteReview(req, res) {
  const review = await loadReview(req.params.id);
  if (!review.user.equals(req.user._id) && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own review');
  }
  await review.deleteOne();
  const stats = await Review.syncBusinessRating(review.business);
  res.json({ success: true, message: 'Review deleted', businessRating: stats });
}

async function loadReviewForOwner(req) {
  const review = await loadReview(req.params.id);
  const business = await Business.findById(review.business).select('owner');
  if (!business) throw ApiError.notFound('Business not found');
  if (!business.owner.equals(req.user._id) && req.user.role !== 'admin') {
    throw ApiError.forbidden('Only the business owner can respond to reviews');
  }
  return review;
}

// PUT /api/reviews/:id/response  (business owner) - creates or replaces the response
async function respondToReview(req, res) {
  const review = await loadReviewForOwner(req);
  review.ownerResponse = { text: req.body.text, respondedAt: new Date() };
  await review.save();
  await review.populate(POPULATE_USER);
  res.json({ success: true, data: review });
}

// DELETE /api/reviews/:id/response  (business owner)
async function deleteResponse(req, res) {
  const review = await loadReviewForOwner(req);
  if (!review.ownerResponse || !review.ownerResponse.text) {
    throw ApiError.notFound('This review has no owner response');
  }
  review.ownerResponse = undefined;
  await review.save();
  res.json({ success: true, message: 'Response removed' });
}

module.exports = {
  createReview,
  getBusinessReviews,
  getMyReviews,
  updateReview,
  deleteReview,
  respondToReview,
  deleteResponse,
};
