const router = require('express').Router();
const ctrl = require('../controllers/reviewController');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const v = require('../validators');

router.post('/', protect, validate(v.review.create), ctrl.createReview);
router.get('/me', protect, ctrl.getMyReviews);
router.get('/business/:id', validate(v.review.forBusiness), ctrl.getBusinessReviews);

router.put('/:id', protect, validate(v.review.update), ctrl.updateReview);
router.delete('/:id', protect, validate(v.review.id), ctrl.deleteReview);

// Business owner response to a review (POST and PUT both upsert)
const ownerOnly = [protect, authorize('owner', 'admin')];
router.post('/:id/response', ...ownerOnly, validate(v.review.respond), ctrl.respondToReview);
router.put('/:id/response', ...ownerOnly, validate(v.review.respond), ctrl.respondToReview);
router.delete('/:id/response', ...ownerOnly, validate(v.review.id), ctrl.deleteResponse);

module.exports = router;
