const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeRegex, getPagination, buildPaginationMeta, getSort, slugify, roundRatingStats, MAX_LIMIT,
} = require('../src/utils/query');

test('escapeRegex neutralises regex metacharacters', () => {
  const rx = new RegExp(escapeRegex('caf.* (best)?'), 'i');
  assert.ok(rx.test('Caf.* (Best)? place'));
  assert.ok(!rx.test('cafe best'));
});

test('getPagination defaults, clamps and computes skip', () => {
  assert.deepEqual(getPagination({}), { page: 1, limit: 10, skip: 0 });
  assert.deepEqual(getPagination({ page: '3', limit: '5' }), { page: 3, limit: 5, skip: 10 });
  assert.equal(getPagination({ limit: '1000' }).limit, MAX_LIMIT);
  assert.deepEqual(getPagination({ page: '-2', limit: 'abc' }), { page: 1, limit: 10, skip: 0 });
});

test('buildPaginationMeta computes page count', () => {
  assert.deepEqual(buildPaginationMeta(21, 1, 10), { total: 21, page: 1, limit: 10, pages: 3 });
  assert.equal(buildPaginationMeta(0, 1, 10).pages, 0);
});

test('getSort falls back to newest', () => {
  assert.deepEqual(getSort('rating'), { averageRating: -1, reviewCount: -1 });
  assert.deepEqual(getSort('bogus'), { createdAt: -1 });
});

test('slugify', () => {
  assert.equal(slugify('  Coffee & Tea Shops '), 'coffee-tea-shops');
  assert.equal(slugify('Café Déjà Vu'), 'cafe-deja-vu');
});

test('roundRatingStats rounds to one decimal and handles no reviews', () => {
  assert.deepEqual(roundRatingStats(undefined), { averageRating: 0, reviewCount: 0 });
  assert.deepEqual(roundRatingStats({ avg: 4.333333, count: 3 }), { averageRating: 4.3, reviewCount: 3 });
  assert.deepEqual(roundRatingStats({ avg: 4.25, count: 4 }), { averageRating: 4.3, reviewCount: 4 });
});
