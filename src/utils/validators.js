const config = require('../config');
const ApiError = require('./api-error');

const { limits } = config;

function assertString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ApiError.badRequest(`${field} is required`);
  }
  return value.trim();
}

function validateUserName(value) {
  const userName = assertString(value, 'userName');
  if (userName.length < limits.userNameMin || userName.length > limits.userNameMax) {
    throw ApiError.badRequest(
      `userName must be between ${limits.userNameMin} and ${limits.userNameMax} characters`
    );
  }
  return userName;
}

function validatePhone(value) {
  const phone = assertString(value, 'phone').replace(/[\s-]/g, '');
  if (!/^\+?\d{4,15}$/.test(phone)) {
    throw ApiError.badRequest('phone must be 4-15 digits');
  }
  return phone;
}

function validateAvatar(value) {
  const avatar = assertString(value, 'avatar');
  if (avatar.length > limits.avatarMax) {
    throw ApiError.badRequest('avatar is too large');
  }
  if (!/^(https?:\/\/|data:image\/)/.test(avatar)) {
    throw ApiError.badRequest('avatar must be an http(s) URL or data:image URI');
  }
  return avatar;
}

function validateMessagePayload({ type, content }) {
  if (type !== 'text' && type !== 'image') {
    throw ApiError.badRequest('type must be "text" or "image"');
  }
  const value = assertString(content, 'content');
  if (type === 'text' && value.length > limits.textMessageMax) {
    throw ApiError.badRequest(`message exceeds ${limits.textMessageMax} characters`);
  }
  if (type === 'image') {
    if (!value.startsWith('data:image/')) {
      throw ApiError.badRequest('image content must be a data:image URI');
    }
    if (value.length > limits.imageDataUrlMax) {
      throw ApiError.badRequest('image is too large (max ~500 KB)');
    }
  }
  return { type, content: value };
}

module.exports = {
  assertString,
  validateUserName,
  validatePhone,
  validateAvatar,
  validateMessagePayload
};
