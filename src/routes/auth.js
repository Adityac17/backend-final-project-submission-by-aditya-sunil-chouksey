const router = require('express').Router();
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const v = require('../validators');

router.post('/register', validate(v.auth.register), ctrl.register);
router.post('/login', validate(v.auth.login), ctrl.login);
router.post('/firebase', validate(v.auth.firebase), ctrl.firebaseLogin);
router.get('/me', protect, ctrl.me);

module.exports = router;
