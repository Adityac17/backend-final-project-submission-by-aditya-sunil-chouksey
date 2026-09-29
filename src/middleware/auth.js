const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Requires a valid app JWT. Loads the user so role changes/deletions take effect immediately.
async function protect(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('No token provided');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  req.user = user;
  next();
}

// Attaches req.user when a valid token is present, but never rejects.
async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      req.user = await User.findById(payload.sub);
    } catch {
      // ignore - treat as anonymous
    }
  }
  next();
}

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(`This action requires one of the roles: ${roles.join(', ')}`);
    }
    next();
  };
}

module.exports = { signToken, protect, optionalAuth, authorize };
