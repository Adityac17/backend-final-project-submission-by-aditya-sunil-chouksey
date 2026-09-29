const Category = require('../models/Category');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');

// GET /api/categories - each category includes how many businesses use it
async function listCategories(_req, res) {
  const [categories, counts] = await Promise.all([
    Category.find().sort({ name: 1 }).lean(),
    Business.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = categories.map(({ __v, ...c }) => ({ ...c, businessCount: countById.get(String(c._id)) || 0 }));
  res.json({ success: true, data });
}

// POST /api/categories  (admin)
async function createCategory(req, res) {
  const { name, description, icon } = req.body;
  const category = await Category.create({ name, description, icon });
  res.status(201).json({ success: true, data: category });
}

// PUT /api/categories/:id  (admin)
async function updateCategory(req, res) {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  for (const key of ['name', 'description', 'icon']) {
    if (req.body[key] !== undefined) category[key] = req.body[key];
  }
  await category.save();
  res.json({ success: true, data: category });
}

// DELETE /api/categories/:id  (admin) - refused while businesses still use it
async function deleteCategory(req, res) {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  const inUse = await Business.countDocuments({ category: category._id });
  if (inUse) throw ApiError.conflict(`Category is used by ${inUse} business(es) and cannot be deleted`);
  await category.deleteOne();
  res.json({ success: true, message: 'Category deleted' });
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
