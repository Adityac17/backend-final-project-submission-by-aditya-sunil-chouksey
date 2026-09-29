const router = require('express').Router();
const ctrl = require('../controllers/categoryController');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const v = require('../validators');

const adminOnly = [protect, authorize('admin')];

router.get('/', ctrl.listCategories);
router.post('/', ...adminOnly, validate(v.category.create), ctrl.createCategory);
router.put('/:id', ...adminOnly, validate(v.category.update), ctrl.updateCategory);
router.delete('/:id', ...adminOnly, validate(v.category.id), ctrl.deleteCategory);

module.exports = router;
