const router = require('express').Router();
const ctrl = require('../controllers/businessController');
const validate = require('../middleware/validate');
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const { uploadPhotos } = require('../middleware/upload');
const v = require('../validators');

const ownerOnly = [protect, authorize('owner', 'admin')];

// Static paths must come before /:id
router.get('/search', optionalAuth, validate(v.business.search), ctrl.searchBusinesses);
router.get('/near', validate(v.business.near), ctrl.nearBusinesses);

router.get('/', optionalAuth, validate(v.business.list), ctrl.listBusinesses);
// multer runs before validation so multipart text fields are available on req.body
router.post('/', ...ownerOnly, uploadPhotos, validate(v.business.create), ctrl.createBusiness);

router.get('/:id', validate(v.business.id), ctrl.getBusiness);
router.put('/:id', ...ownerOnly, uploadPhotos, validate(v.business.update), ctrl.updateBusiness);
router.delete('/:id', ...ownerOnly, validate(v.business.id), ctrl.deleteBusiness);

router.post('/:id/photos', ...ownerOnly, uploadPhotos, validate(v.business.id), ctrl.addPhotos);
router.delete('/:id/photos/:photoId', ...ownerOnly, validate(v.business.photo), ctrl.deletePhoto);

module.exports = router;
