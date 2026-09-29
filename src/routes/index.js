const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/businesses', require('./businesses'));
router.use('/reviews', require('./reviews'));
router.use('/categories', require('./categories'));

module.exports = router;
