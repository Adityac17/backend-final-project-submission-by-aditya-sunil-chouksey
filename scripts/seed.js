// Seeds categories, demo users, businesses and reviews.
// Usage: npm run seed            (adds categories only if missing, skips if demo data exists)
//        npm run seed -- --fresh (wipes the database first)
//        npm run seed -- --categories-only (production: no demo accounts)
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Business = require('../src/models/Business');
const Review = require('../src/models/Review');

const CATEGORIES = [
  { name: 'Cafe', icon: '☕', description: 'Coffee shops and cafes' },
  { name: 'Restaurant', icon: '🍽️', description: 'Dining and eateries' },
  { name: 'Bakery', icon: '🥐', description: 'Breads, cakes and pastries' },
  { name: 'Salon', icon: '💇', description: 'Hair and beauty' },
  { name: 'Gym', icon: '🏋️', description: 'Fitness centres' },
  { name: 'Grocery', icon: '🛒', description: 'Supermarkets and kirana stores' },
  { name: 'Pharmacy', icon: '💊', description: 'Chemists and medical stores' },
  { name: 'Bookstore', icon: '📚', description: 'Books and stationery' },
];

const PASSWORD = 'password123';

async function main() {
  await connectDB();

  if (process.argv.includes('--fresh')) {
    await mongoose.connection.dropDatabase();
    console.log('[seed] database dropped');
  }

  for (const c of CATEGORIES) {
    await Category.updateOne({ name: c.name }, { $setOnInsert: c }, { upsert: true });
  }
  // updateOne bypasses the slug hook, so fill any missing slugs
  for (const c of await Category.find({ slug: { $exists: false } })) await c.save();
  console.log(`[seed] ${CATEGORIES.length} categories ready`);
  if (process.argv.includes('--categories-only')) return;

  if (await User.exists({ email: 'admin@townrate.dev' })) {
    console.log('[seed] demo data already present (use --fresh to reset)');
    return;
  }

  const [admin, owner, owner2, alice, bob] = await User.create([
    { name: 'Admin', email: 'admin@townrate.dev', password: PASSWORD, role: 'admin' },
    { name: 'Rahul Mehta', email: 'owner@townrate.dev', password: PASSWORD, role: 'owner' },
    { name: 'Sara Khan', email: 'owner2@townrate.dev', password: PASSWORD, role: 'owner' },
    { name: 'Alice', email: 'alice@townrate.dev', password: PASSWORD, role: 'user' },
    { name: 'Bob', email: 'bob@townrate.dev', password: PASSWORD, role: 'user' },
  ]);

  const cat = Object.fromEntries((await Category.find()).map((c) => [c.slug, c._id]));
  const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

  const businesses = await Business.create([
    {
      owner: owner._id, name: 'Bean There Cafe', category: cat.cafe, tags: ['coffee', 'wifi', 'breakfast'],
      description: 'Cozy neighbourhood cafe with single-origin pour-overs.',
      address: { street: '12 Hill Road', city: 'Mumbai', state: 'Maharashtra', zip: '400050' },
      location: point(19.0544, 72.8406), phone: '+91 98200 11111',
    },
    {
      owner: owner._id, name: 'Sunrise Bakery', category: cat.bakery, tags: ['bread', 'cakes'],
      description: 'Fresh sourdough every morning.',
      address: { street: '4 Carter Road', city: 'Mumbai', state: 'Maharashtra', zip: '400050' },
      location: point(19.0650, 72.8225),
    },
    {
      owner: owner2._id, name: 'Chai & Chapters', category: cat.cafe, tags: ['tea', 'books', 'quiet'],
      description: 'A reading cafe serving masala chai and snacks.',
      address: { street: '88 Linking Road', city: 'Mumbai', state: 'Maharashtra', zip: '400054' },
      location: point(19.0728, 72.8347),
    },
    {
      owner: owner2._id, name: 'Iron Temple Gym', category: cat.gym, tags: ['weights', 'cardio'],
      description: 'Open 24/7 with certified trainers.',
      address: { street: '5 MG Road', city: 'Pune', state: 'Maharashtra', zip: '411001' },
      location: point(18.5196, 73.8553),
    },
    {
      owner: owner._id, name: 'Spice Route Kitchen', category: cat.restaurant, tags: ['north indian', 'family'],
      description: 'Tandoor specialities and thalis.',
      address: { street: '21 Brigade Road', city: 'Bengaluru', state: 'Karnataka', zip: '560025' },
      location: point(12.9716, 77.6070),
    },
  ]);

  const [beanThere, sunrise, chai, gym] = businesses;
  await Review.create([
    { business: beanThere._id, user: alice._id, rating: 5, title: 'Best cold brew', comment: 'Friendly staff and fast wifi.' },
    { business: beanThere._id, user: bob._id, rating: 4, title: 'Good but busy', comment: 'Hard to find a seat on weekends.' },
    { business: sunrise._id, user: alice._id, rating: 4, comment: 'Sourdough is excellent.' },
    { business: chai._id, user: bob._id, rating: 5, comment: 'Perfect spot to read.' },
    { business: gym._id, user: alice._id, rating: 3, comment: 'Good equipment, crowded evenings.' },
  ]);
  await Review.updateOne(
    { business: beanThere._id, user: bob._id },
    { ownerResponse: { text: 'Thanks Bob! We added more seating last week.', respondedAt: new Date() } }
  );
  for (const b of businesses) await Review.syncBusinessRating(b._id);

  console.log(`[seed] created 5 users (password "${PASSWORD}"), ${businesses.length} businesses, 5 reviews`);
  console.log('[seed] logins: admin@townrate.dev, owner@townrate.dev, owner2@townrate.dev, alice@townrate.dev, bob@townrate.dev');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
