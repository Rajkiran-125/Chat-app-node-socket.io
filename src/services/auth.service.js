const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/api-error');
const { validateUserName, validatePhone, validateAvatar } = require('../utils/validators');
const userRepository = require('../repositories/user.repository');

/** Full self-profile — only ever returned to the user themselves. Includes phone. */
function toPublicUser(user) {
  const { id, userName, phone, avatar, createdAt, lastSeenAt } = user;
  return { id, userName, phone, avatar, createdAt, lastSeenAt };
}

/**
 * Projection safe to expose to OTHER users. Deliberately omits `phone`:
 * because login is phone-only, leaking phones to every authenticated caller
 * would let anyone harvest them and log in as any account.
 */
function toPublicProfile(user) {
  const { id, userName, avatar, createdAt, lastSeenAt } = user;
  return { id, userName, avatar, createdAt, lastSeenAt };
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256'
  });
}

/** Returns the user for a valid token, otherwise null. */
async function resolveToken(token) {
  if (!token) return null;
  try {
    // Pin the algorithm so a token cannot be forged with alg:none or a swapped algorithm.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return await userRepository.findById(payload.sub);
  } catch {
    return null;
  }
}

async function register({ userName, phone, avatar }) {
  const cleanName = validateUserName(userName);
  const cleanPhone = validatePhone(phone);
  const cleanAvatar = validateAvatar(avatar);

  if (await userRepository.findByPhone(cleanPhone)) {
    throw ApiError.conflict('A user with this phone number already exists');
  }

  const user = await userRepository.create({
    userName: cleanName,
    phone: cleanPhone,
    avatar: cleanAvatar
  });
  return { user: toPublicUser(user), token: signToken(user) };
}

async function login({ phone }) {
  const cleanPhone = validatePhone(phone);
  const user = await userRepository.findByPhone(cleanPhone);
  if (!user) {
    throw ApiError.notFound('No account found for this phone number');
  }
  return { user: toPublicUser(user), token: signToken(user) };
}

module.exports = { register, login, resolveToken, toPublicUser, toPublicProfile };
