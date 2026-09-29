// End-to-end API tests against a real MongoDB.
// Uses TEST_MONGO_URI (default mongodb://127.0.0.1:27017/townrate_test); skipped if unreachable.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
// Force local photo storage even if the developer's .env has Firebase credentials
for (const k of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) {
  process.env[k] = '';
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../src/app');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const { LOCAL_DIR } = require('../src/services/storage');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/townrate_test';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

let dbAvailable = true;
const ctx = {};

test.before(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
    await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  } catch (err) {
    dbAvailable = false;
    console.warn(`[test] MongoDB not reachable at ${MONGO_URI}, skipping API tests (${err.message})`);
  }
});

test.after(async () => {
  if (dbAvailable) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (ctx.businessId) fs.rmSync(path.join(LOCAL_DIR, 'businesses', ctx.businessId), { recursive: true, force: true });
});

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

test('TownRate API', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB unavailable');

  await t.test('health reports database connected', async () => {
    const res = await api().get('/api/health').expect(200);
    assert.equal(res.body.database, 'connected');
    assert.equal(res.body.photoStorage, 'local');
  });

  await t.test('setup: categories and admin', async () => {
    await Category.create([{ name: 'Cafe' }, { name: 'Gym' }]);
    await User.create({ name: 'Admin', email: 'admin@test.dev', password: 'secret123', role: 'admin' });
    const res = await api().post('/api/auth/login').send({ email: 'admin@test.dev', password: 'secret123' }).expect(200);
    ctx.adminToken = res.body.data.token;
  });

  await t.test('POST /api/auth/register validates input', async () => {
    const res = await api().post('/api/auth/register').send({ name: '', email: 'nope', password: '1' }).expect(422);
    const fields = res.body.errors.map((e) => e.field);
    assert.ok(fields.includes('name') && fields.includes('email') && fields.includes('password'));
  });

  await t.test('POST /api/auth/register refuses admin self-registration', async () => {
    await api().post('/api/auth/register').send({ name: 'X', email: 'x@test.dev', password: 'secret123', role: 'admin' }).expect(422);
  });

  await t.test('register owner and two users', async () => {
    const owner = await api().post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@test.dev', password: 'secret123', role: 'owner' }).expect(201);
    ctx.ownerToken = owner.body.data.token;
    assert.equal(owner.body.data.user.role, 'owner');
    assert.equal(owner.body.data.user.password, undefined);

    const u1 = await api().post('/api/auth/register').send({ name: 'Alice', email: 'Alice@Test.dev', password: 'secret123' }).expect(201);
    ctx.aliceToken = u1.body.data.token;
    assert.equal(u1.body.data.user.email, 'alice@test.dev');
    const u2 = await api().post('/api/auth/register').send({ name: 'Bob', email: 'bob@test.dev', password: 'secret123' }).expect(201);
    ctx.bobToken = u2.body.data.token;
  });

  await t.test('duplicate email is rejected', async () => {
    await api().post('/api/auth/register').send({ name: 'A2', email: 'alice@test.dev', password: 'secret123' }).expect(409);
  });

  await t.test('login: wrong password 401, right password 200, /me works', async () => {
    await api().post('/api/auth/login').send({ email: 'alice@test.dev', password: 'wrongpass' }).expect(401);
    await api().post('/api/auth/login').send({ email: 'alice@test.dev', password: 'secret123' }).expect(200);
    const me = await api().get('/api/auth/me').set(auth(ctx.aliceToken)).expect(200);
    assert.equal(me.body.data.name, 'Alice');
    await api().get('/api/auth/me').expect(401);
    await api().get('/api/auth/me').set(auth('garbage')).expect(401);
  });

  await t.test('Firebase login returns 503 when Firebase is not configured', async () => {
    await api().post('/api/auth/firebase').send({ idToken: 'abc' }).expect(503);
  });

  await t.test('POST /api/businesses: plain user is forbidden', async () => {
    await api().post('/api/businesses').set(auth(ctx.aliceToken))
      .send({ name: 'Nope', category: 'cafe', address: { city: 'Mumbai' } }).expect(403);
  });

  await t.test('POST /api/businesses: validation errors', async () => {
    const res = await api().post('/api/businesses').set(auth(ctx.ownerToken))
      .send({ name: 'Bad', latitude: 19 }).expect(422);
    const fields = res.body.errors.map((e) => e.field);
    assert.ok(fields.includes('category'));
    assert.ok(fields.includes('address.city'));
    assert.ok(fields.includes('longitude'));
  });

  await t.test('POST /api/businesses: unknown category 400', async () => {
    await api().post('/api/businesses').set(auth(ctx.ownerToken))
      .send({ name: 'X', category: 'spaceship', address: { city: 'Mumbai' } }).expect(400);
  });

  await t.test('POST /api/businesses multipart with photo', async () => {
    const res = await api().post('/api/businesses').set(auth(ctx.ownerToken))
      .field('name', 'Bean There Cafe')
      .field('description', 'Great pour-over coffee')
      .field('category', 'cafe')
      .field('tags', 'coffee, wifi')
      .field('address[city]', 'Mumbai')
      .field('address[street]', '12 Hill Road')
      .field('latitude', '19.0544')
      .field('longitude', '72.8406')
      .attach('photos', PNG, { filename: 'front.png', contentType: 'image/png' })
      .expect(201);
    const b = res.body.data;
    ctx.businessId = b._id;
    assert.equal(b.category.slug, 'cafe');
    assert.deepEqual(b.tags, ['coffee', 'wifi']);
    assert.equal(b.address.city, 'Mumbai');
    assert.deepEqual(b.location.coordinates, [72.8406, 19.0544]);
    assert.equal(b.photos.length, 1);
    assert.equal(b.photos[0].provider, 'local');
    ctx.photoId = b.photos[0]._id;

    // the stored file is served back
    const url = new URL(b.photos[0].url);
    const img = await api().get(url.pathname).expect(200);
    assert.equal(img.headers['content-type'], 'image/png');
  });

  await t.test('upload rejects non-image files', async () => {
    await api().post(`/api/businesses/${ctx.businessId}/photos`).set(auth(ctx.ownerToken))
      .attach('photos', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' }).expect(400);
  });

  await t.test('POST /api/businesses JSON (second and third business)', async () => {
    const gym = await api().post('/api/businesses').set(auth(ctx.ownerToken)).send({
      name: 'Iron Temple', category: 'Gym', address: { city: 'Pune' }, latitude: 18.5196, longitude: 73.8553,
    }).expect(201);
    ctx.gymId = gym.body.data._id;

    await api().post('/api/businesses').set(auth(ctx.ownerToken)).send({
      name: 'Chai Point', description: 'Tea and snacks', category: 'cafe', tags: ['tea'],
      address: { city: 'Mumbai' }, latitude: 19.0728, longitude: 72.8347,
    }).expect(201);
  });

  await t.test('GET /api/businesses lists with filters and pagination', async () => {
    const all = await api().get('/api/businesses').expect(200);
    assert.equal(all.body.pagination.total, 3);

    const cafes = await api().get('/api/businesses?category=cafe').expect(200);
    assert.equal(cafes.body.data.length, 2);

    const pune = await api().get('/api/businesses?city=pune').expect(200);
    assert.equal(pune.body.data.length, 1);
    assert.equal(pune.body.data[0].name, 'Iron Temple');

    const paged = await api().get('/api/businesses?limit=2&page=2').expect(200);
    assert.equal(paged.body.data.length, 1);
    assert.equal(paged.body.pagination.pages, 2);

    const unknown = await api().get('/api/businesses?category=nothing').expect(200);
    assert.equal(unknown.body.data.length, 0);

    const mine = await api().get('/api/businesses?owner=me').set(auth(ctx.ownerToken)).expect(200);
    assert.equal(mine.body.data.length, 3);
    await api().get('/api/businesses?owner=me').expect(401);
  });

  await t.test('GET /api/businesses/:id', async () => {
    const res = await api().get(`/api/businesses/${ctx.businessId}`).expect(200);
    assert.equal(res.body.data.name, 'Bean There Cafe');
    assert.equal(res.body.data.owner.name, 'Owner');
    await api().get('/api/businesses/not-an-id').expect(422);
    await api().get(`/api/businesses/${new mongoose.Types.ObjectId()}`).expect(404);
  });

  await t.test('GET /api/businesses/search?keyword=cafe', async () => {
    // "cafe" matches the category, so Chai Point is found even though its text doesn't say cafe
    const res = await api().get('/api/businesses/search?keyword=cafe').expect(200);
    const names = res.body.data.map((b) => b.name).sort();
    assert.deepEqual(names, ['Bean There Cafe', 'Chai Point']);

    const partial = await api().get('/api/businesses/search?keyword=pour').expect(200);
    assert.equal(partial.body.data.length, 1);

    const byTag = await api().get('/api/businesses/search?keyword=wifi').expect(200);
    assert.equal(byTag.body.data[0].name, 'Bean There Cafe');

    const regexSafe = await api().get('/api/businesses/search?keyword=.*').expect(200);
    assert.equal(regexSafe.body.data.length, 0);

    await api().get('/api/businesses/search').expect(422);
  });

  await t.test('GET /api/businesses/near returns nearest first with distance', async () => {
    // Bandra, Mumbai
    const res = await api().get('/api/businesses/near?lat=19.0596&lng=72.8295&radius=10').expect(200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.data[0].name, 'Bean There Cafe');
    assert.ok(res.body.data[0].distanceKm < res.body.data[1].distanceKm);
    assert.equal(res.body.data[0].category.slug, 'cafe');

    const wide = await api().get('/api/businesses/near?lat=19.0596&lng=72.8295&radius=100').expect(200);
    assert.equal(wide.body.data.length, 2); // Pune is ~120km away

    const gymsOnly = await api().get('/api/businesses/near?lat=18.52&lng=73.85&category=gym').expect(200);
    assert.equal(gymsOnly.body.data.length, 1);

    await api().get('/api/businesses/near?lat=200&lng=72').expect(422);
    await api().get('/api/businesses/near').expect(422);
  });

  await t.test('PUT /api/businesses/:id: owner can update, others cannot', async () => {
    await api().put(`/api/businesses/${ctx.businessId}`).set(auth(ctx.aliceToken)).send({ name: 'Hacked' }).expect(403);

    // a second owner who doesn't own this business
    const other = await api().post('/api/auth/register')
      .send({ name: 'Other', email: 'other@test.dev', password: 'secret123', role: 'owner' }).expect(201);
    ctx.otherOwnerToken = other.body.data.token;
    await api().put(`/api/businesses/${ctx.businessId}`).set(auth(ctx.otherOwnerToken)).send({ name: 'Hacked' }).expect(403);

    await api().put(`/api/businesses/${ctx.businessId}`).set(auth(ctx.ownerToken)).send({ averageRating: 5 }).expect(422);

    const res = await api().put(`/api/businesses/${ctx.businessId}`).set(auth(ctx.ownerToken))
      .send({ phone: '+91 98200 11111', address: { zip: '400050' } }).expect(200);
    assert.equal(res.body.data.phone, '+91 98200 11111');
    assert.equal(res.body.data.address.zip, '400050');
    assert.equal(res.body.data.address.city, 'Mumbai'); // partial address update keeps other fields
    assert.equal(res.body.data.name, 'Bean There Cafe');
  });

  await t.test('POST /api/reviews and rating aggregation', async () => {
    const r1 = await api().post('/api/reviews').set(auth(ctx.aliceToken))
      .send({ business: ctx.businessId, rating: 5, title: 'Loved it', comment: 'Great coffee' }).expect(201);
    ctx.aliceReviewId = r1.body.data._id;
    assert.equal(r1.body.data.user.name, 'Alice');
    assert.deepEqual(r1.body.businessRating, { averageRating: 5, reviewCount: 1 });

    const r2 = await api().post('/api/reviews').set(auth(ctx.bobToken))
      .send({ business: ctx.businessId, rating: 2, comment: 'Too crowded' }).expect(201);
    ctx.bobReviewId = r2.body.data._id;
    assert.deepEqual(r2.body.businessRating, { averageRating: 3.5, reviewCount: 2 });

    const b = await api().get(`/api/businesses/${ctx.businessId}`).expect(200);
    assert.equal(b.body.data.averageRating, 3.5);
    assert.equal(b.body.data.reviewCount, 2);
  });

  await t.test('review rules: duplicate 409, own business 403, bad rating 422, auth 401', async () => {
    await api().post('/api/reviews').set(auth(ctx.aliceToken)).send({ business: ctx.businessId, rating: 4 }).expect(409);
    await api().post('/api/reviews').set(auth(ctx.ownerToken)).send({ business: ctx.businessId, rating: 5 }).expect(403);
    await api().post('/api/reviews').set(auth(ctx.aliceToken)).send({ business: ctx.gymId, rating: 6 }).expect(422);
    await api().post('/api/reviews').set(auth(ctx.aliceToken)).send({ business: ctx.gymId, rating: 4.5 }).expect(422);
    await api().post('/api/reviews').send({ business: ctx.gymId, rating: 4 }).expect(401);
    await api().post('/api/reviews').set(auth(ctx.aliceToken))
      .send({ business: new mongoose.Types.ObjectId().toString(), rating: 4 }).expect(404);
  });

  await t.test('GET /api/reviews/business/:id with breakdown and sorting', async () => {
    const res = await api().get(`/api/reviews/business/${ctx.businessId}?sort=lowest`).expect(200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.data[0].rating, 2);
    assert.deepEqual(res.body.summary.breakdown, { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 });
    assert.equal(res.body.summary.averageRating, 3.5);
    await api().get(`/api/reviews/business/${new mongoose.Types.ObjectId()}`).expect(404);
  });

  await t.test('PUT /api/reviews/:id only by author, re-aggregates', async () => {
    await api().put(`/api/reviews/${ctx.bobReviewId}`).set(auth(ctx.aliceToken)).send({ rating: 5 }).expect(403);
    const res = await api().put(`/api/reviews/${ctx.bobReviewId}`).set(auth(ctx.bobToken)).send({ rating: 4 }).expect(200);
    assert.equal(res.body.data.rating, 4);
    assert.deepEqual(res.body.businessRating, { averageRating: 4.5, reviewCount: 2 });
  });

  await t.test('owner response to review', async () => {
    const url = `/api/reviews/${ctx.bobReviewId}/response`;
    await api().post(url).set(auth(ctx.bobToken)).send({ text: 'x' }).expect(403); // not an owner
    await api().post(url).set(auth(ctx.otherOwnerToken)).send({ text: 'x' }).expect(403); // not this business
    await api().post(url).set(auth(ctx.ownerToken)).send({ text: '' }).expect(422);

    const res = await api().post(url).set(auth(ctx.ownerToken)).send({ text: 'Thanks, we added seating!' }).expect(200);
    assert.equal(res.body.data.ownerResponse.text, 'Thanks, we added seating!');
    assert.ok(res.body.data.ownerResponse.respondedAt);

    const edited = await api().put(url).set(auth(ctx.ownerToken)).send({ text: 'Updated reply' }).expect(200);
    assert.equal(edited.body.data.ownerResponse.text, 'Updated reply');

    const list = await api().get(`/api/reviews/business/${ctx.businessId}`).expect(200);
    assert.equal(list.body.data.find((r) => r._id === ctx.bobReviewId).ownerResponse.text, 'Updated reply');

    await api().delete(url).set(auth(ctx.ownerToken)).expect(200);
    await api().delete(url).set(auth(ctx.ownerToken)).expect(404);
  });

  await t.test('GET /api/reviews/me', async () => {
    const res = await api().get('/api/reviews/me').set(auth(ctx.aliceToken)).expect(200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].business.name, 'Bean There Cafe');
  });

  await t.test('search can filter by minRating and sorts by rating', async () => {
    const res = await api().get('/api/businesses/search?keyword=cafe&minRating=4').expect(200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, 'Bean There Cafe');
  });

  await t.test('DELETE /api/reviews/:id re-aggregates', async () => {
    await api().delete(`/api/reviews/${ctx.aliceReviewId}`).set(auth(ctx.bobToken)).expect(403);
    const res = await api().delete(`/api/reviews/${ctx.aliceReviewId}`).set(auth(ctx.aliceToken)).expect(200);
    assert.deepEqual(res.body.businessRating, { averageRating: 4, reviewCount: 1 });
  });

  await t.test('serverless deploy without Firebase: uploads fail with 503, no local writes', async () => {
    const env = require('../src/config/env');
    env.isServerless = true;
    try {
      const res = await api().post(`/api/businesses/${ctx.businessId}/photos`).set(auth(ctx.ownerToken))
        .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(503);
      assert.match(res.body.message, /Firebase Storage/);
      const health = await api().get('/api/health').expect(200);
      assert.equal(health.body.photoStorage, 'unavailable');
      // JSON-only creates still work
      await api().post('/api/businesses').set(auth(ctx.ownerToken))
        .send({ name: 'No Photo Cafe', category: 'cafe', address: { city: 'Delhi' } }).expect(201);
    } finally {
      env.isServerless = false;
    }
  });

  await t.test('photos: add and delete', async () => {
    const added = await api().post(`/api/businesses/${ctx.businessId}/photos`).set(auth(ctx.ownerToken))
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', PNG, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);
    assert.equal(added.body.data.length, 3);

    await api().post(`/api/businesses/${ctx.businessId}/photos`).set(auth(ctx.ownerToken)).expect(400);
    await api().delete(`/api/businesses/${ctx.businessId}/photos/${ctx.photoId}`).set(auth(ctx.aliceToken)).expect(403);

    const photo = added.body.data.find((p) => p._id === ctx.photoId);
    const file = path.join(LOCAL_DIR, photo.path);
    assert.ok(fs.existsSync(file));
    const res = await api().delete(`/api/businesses/${ctx.businessId}/photos/${ctx.photoId}`).set(auth(ctx.ownerToken)).expect(200);
    assert.equal(res.body.data.length, 2);
    assert.ok(!fs.existsSync(file));
  });

  await t.test('categories: list with counts, admin-only writes', async () => {
    const res = await api().get('/api/categories').expect(200);
    const cafe = res.body.data.find((c) => c.slug === 'cafe');
    assert.equal(cafe.businessCount, 3);

    await api().post('/api/categories').set(auth(ctx.ownerToken)).send({ name: 'Bakery' }).expect(403);
    const created = await api().post('/api/categories').set(auth(ctx.adminToken)).send({ name: 'Book Store' }).expect(201);
    assert.equal(created.body.data.slug, 'book-store');
    await api().post('/api/categories').set(auth(ctx.adminToken)).send({ name: 'Book Store' }).expect(409);

    await api().delete(`/api/categories/${cafe._id}`).set(auth(ctx.adminToken)).expect(409); // in use
    await api().delete(`/api/categories/${created.body.data._id}`).set(auth(ctx.adminToken)).expect(200);
  });

  await t.test('DELETE /api/businesses/:id removes reviews too', async () => {
    await api().delete(`/api/businesses/${ctx.businessId}`).set(auth(ctx.aliceToken)).expect(403);
    await api().delete(`/api/businesses/${ctx.businessId}`).set(auth(ctx.ownerToken)).expect(200);
    await api().get(`/api/businesses/${ctx.businessId}`).expect(404);
    const Review = mongoose.model('Review');
    assert.equal(await Review.countDocuments({ business: ctx.businessId }), 0);
  });

  await t.test('admin can manage any business', async () => {
    await api().put(`/api/businesses/${ctx.gymId}`).set(auth(ctx.adminToken)).send({ description: 'Moderated' }).expect(200);
  });

  await t.test('Swagger UI page and spec', async () => {
    const page = await api().get('/api-docs').expect(200);
    assert.match(page.headers['content-type'], /html/);
    assert.match(page.text, /swagger-ui-bundle\.js/);
    assert.match(page.headers['content-security-policy'], /cdn\.jsdelivr\.net/);
    const init = await api().get('/api-docs/init.js').expect(200);
    assert.match(init.headers['content-type'], /javascript/);
    const spec = await api().get('/api-docs.json').expect(200);
    assert.equal(spec.body.openapi, '3.0.3');
  });

  await t.test('unknown route and malformed JSON', async () => {
    await api().get('/api/nope').expect(404);
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400);
    assert.equal(res.body.message, 'Malformed JSON body');
  });
});
