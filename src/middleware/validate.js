const { validationResult } = require('express-validator');

// Runs express-validator chains and responds 422 with field errors if any fail.
function validate(chains) {
  return async (req, res, next) => {
    for (const chain of chains) {
      await chain.run(req);
    }
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: result.array().map((e) => ({ field: e.path, message: e.msg, location: e.location })),
    });
  };
}

module.exports = validate;
