const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../middleware/auth');
const { getFirebaseApp, isFirebaseEnabled } = require('../config/firebase');

function authResponse(res, status, user) {
  res.status(status).json({ success: true, data: { token: signToken(user), user } });
}

// POST /api/auth/register
async function register(req, res) {
  const { name, email, password, role = 'user' } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('Email is already registered');
  const user = await User.create({ name, email, password, role });
  authResponse(res, 201, user);
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  authResponse(res, 200, user);
}

// POST /api/auth/firebase
// Exchanges a Firebase ID token (from the client SDK) for an app JWT.
// Links to an existing account by email, or creates one on first sign-in.
async function firebaseLogin(req, res) {
  if (!isFirebaseEnabled()) {
    throw new ApiError(503, 'Firebase authentication is not configured on this server');
  }

  let decoded;
  try {
    decoded = await getFirebaseApp().auth().verifyIdToken(req.body.idToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired Firebase ID token');
  }
  if (!decoded.email) throw ApiError.badRequest('Firebase account has no email address');

  let user = await User.findOne({ firebaseUid: decoded.uid });
  let status = 200;
  if (!user) {
    user = await User.findOne({ email: decoded.email.toLowerCase() });
    if (user) {
      user.firebaseUid = decoded.uid;
      await user.save();
    } else {
      user = await User.create({
        name: decoded.name || decoded.email.split('@')[0],
        email: decoded.email,
        firebaseUid: decoded.uid,
        avatarUrl: decoded.picture,
        role: req.body.role || 'user',
      });
      status = 201;
    }
  }
  authResponse(res, status, user);
}

// GET /api/auth/me
function me(req, res) {
  res.json({ success: true, data: req.user });
}

module.exports = { register, login, firebaseLogin, me };
