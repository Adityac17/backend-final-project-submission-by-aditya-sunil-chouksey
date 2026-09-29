// Pure helpers for list/search endpoints. No DB access, so they're unit-testable.

const MAX_LIMIT = 50;

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPagination(query = {}, defaultLimit = 10) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function buildPaginationMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) || 0 };
}

const SORTS = {
  rating: { averageRating: -1, reviewCount: -1 },
  reviews: { reviewCount: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { name: 1 },
};

function getSort(sortKey) {
  return SORTS[sortKey] || SORTS.newest;
}

function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Turns an { avg, count } aggregation result into the cached business fields,
// rounding to one decimal. Missing result (no reviews) means zero.
function roundRatingStats(agg) {
  if (!agg || !agg.count) return { averageRating: 0, reviewCount: 0 };
  return { averageRating: Math.round(agg.avg * 10) / 10, reviewCount: agg.count };
}

module.exports = {
  MAX_LIMIT,
  escapeRegex,
  getPagination,
  buildPaginationMeta,
  getSort,
  slugify,
  roundRatingStats,
};
