import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Generate JWT Access Token
 * @param {Object} payload - User data to include in token
 * @returns {string} JWT token
 */
export const generateAccessToken = (payload) => {
  const tokenPayload = {
    userId: payload.userId || payload._id,
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId || null,
    permissions: payload.permissions || null
  };

  return jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      issuer: 'DigiPharmaSaaS',
      audience: 'pharmacy-users'
    }
  );
};

/**
 * Generate JWT Refresh Token
 * @param {Object} payload - User data for refresh token
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  const tokenPayload = {
    userId: payload.userId || payload._id,
    type: 'refresh',
    tokenId: crypto.randomUUID() // Unique ID for token tracking
  };

  return jwt.sign(
    tokenPayload,
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: '7d',
      issuer: 'DigiPharmaSaaS',
      audience: 'pharmacy-users'
    }
  );
};

/**
 * Verify JWT Token
 * @param {string} token - JWT token to verify
 * @param {string} type - 'access' or 'refresh'
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token, type = 'access') => {
  const secret = type === 'refresh' 
    ? process.env.JWT_REFRESH_SECRET 
    : process.env.JWT_SECRET;

  try {
    return jwt.verify(token, secret, {
      issuer: 'DigiPharmaSaaS',
      audience: 'pharmacy-users'
    });
  } catch (error) {
    throw new Error(`Invalid ${type} token: ${error.message}`);
  }
};

/**
 * Generate Email Verification Token
 * @returns {string} Random token for email verification
 */
export const generateEmailVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate Password Reset Token
 * @returns {Object} Token and expiry date
 */
export const generatePasswordResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  return { token, expires };
};

/**
 * Generate Unique Subdomain
 * @param {string} pharmacyName - Name of the pharmacy
 * @returns {string} Unique subdomain
 */
export const generateSubdomain = (pharmacyName) => {
  // Convert to lowercase, remove special chars, replace spaces with hyphens
  let subdomain = pharmacyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // Remove leading/trailing hyphens
  subdomain = subdomain.replace(/^-+|-+$/g, '');

  // Add random suffix if needed to ensure uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  
  return `${subdomain}-${randomSuffix}`;
};

/**
 * Generate Random Password
 * @param {number} length - Password length (default: 12)
 * @returns {string} Random password
 */
export const generateRandomPassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
};

/**
 * Extract Bearer Token from Authorization Header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} JWT token or null
 */
export const extractBearerToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7); // Remove 'Bearer ' prefix
};

/**
 * Generate API Key for external integrations
 * @param {string} prefix - Prefix for the API key (default: 'pk_')
 * @returns {string} API key
 */
export const generateApiKey = (prefix = 'pk_') => {
  const randomString = crypto.randomBytes(32).toString('hex');
  return `${prefix}${randomString}`;
};

/**
 * Create Token Response Object
 * @param {Object} user - User object
 * @param {Object} deviceInfo - Device information (optional)
 * @returns {Object} Token response with access token, refresh token, and user info
 */
export const createTokenResponse = (user, deviceInfo = {}) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    success: true,
    tokens: {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    },
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      permissions: user.permissions,
      status: user.status
    },
    deviceInfo
  };
};

/**
 * Hash sensitive data (for storing in database)
 * @param {string} data - Data to hash
 * @returns {string} Hashed data
 */
export const hashData = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  generateSubdomain,
  generateRandomPassword,
  extractBearerToken,
  generateApiKey,
  createTokenResponse,
  hashData
};