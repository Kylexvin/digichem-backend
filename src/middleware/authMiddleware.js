import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { verifyToken, extractBearerToken } from '../utils/generateToken.js';

/**
 * Main authentication middleware
 * Verifies JWT token and adds user info to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.header('Authorization');
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    // Verify token
    const decoded = verifyToken(token, 'access');
    
    // Get user from database (to ensure user still exists and is active)
    const user = await User.findById(decoded.userId).select('+status');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }
    
    // Check if user account is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: `Account is ${user.status}. Please contact support.`
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to failed login attempts.'
      });
    }
    
    // Add user info to request object
    req.user = {
      id: user._id,
      userId: user._id, // For backward compatibility
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      permissions: user.permissions,
      status: user.status
    };
    
    // Update last activity (optional - might be too frequent for some use cases)
    // user.updateActivity();
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format.',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Authentication failed.',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Role-based authorization middleware
 * Usage: authorize(['super_admin', 'pharmacy_owner'])
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: req.user.role
      });
    }
    
    next();
  };
};

/**
 * Super Admin only middleware
 */
export const superAdminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin privileges required.'
    });
  }
  next();
};

/**
 * Pharmacy Owner only middleware
 */
export const pharmacyOwnerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'pharmacy_owner') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Pharmacy owner privileges required.'
    });
  }
  next();
};

/**
 * Tenant isolation middleware
 * Ensures users can only access data from their own pharmacy
 */
export const tenantIsolation = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  // Super admin can access everything
  if (req.user.role === 'super_admin') {
    return next();
  }
  
  // Must have tenantId for non-super-admin users
  if (!req.user.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. No pharmacy associated with account.'
    });
  }
  
  // Add tenant filter to request for database queries
  req.tenantFilter = { tenantId: req.user.tenantId };
  
  next();
};

/**
 * Permission-based authorization for attendants
 * Usage: checkPermission('sales') or checkPermission('inventory', 'edit')
 */
export const checkPermission = (permission, level = null) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    // Super admin and pharmacy owner have all permissions
    if (['super_admin', 'pharmacy_owner'].includes(req.user.role)) {
      return next();
    }
    
    // For attendants, check specific permissions
    if (req.user.role === 'attendant') {
      const permissions = req.user.permissions;
      
      if (!permissions || !permissions[permission]) {
        return res.status(403).json({
          success: false,
          message: `Access denied. ${permission} permission required.`
        });
      }
      
      const permValue = permissions[permission];
      
      // Boolean permissions
      if (typeof permValue === 'boolean') {
        if (!permValue) {
          return res.status(403).json({
            success: false,
            message: `Access denied. ${permission} permission required.`
          });
        }
        return next();
      }
      
      // String permissions with levels (none/view/edit)
      if (typeof permValue === 'string') {
        if (permValue === 'none') {
          return res.status(403).json({
            success: false,
            message: `Access denied. ${permission} permission required.`
          });
        }
        
        if (level && permValue !== level && !(permValue === 'edit' && level === 'view')) {
          return res.status(403).json({
            success: false,
            message: `Access denied. ${permission} ${level} permission required.`
          });
        }
        
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied. Invalid role or permissions.'
    });
  };
};

/**
 * Optional authentication middleware
 * Adds user info if token is valid, but doesn't require authentication
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = extractBearerToken(authHeader);
    
    if (token) {
      const decoded = verifyToken(token, 'access');
      const user = await User.findById(decoded.userId).select('+status');
      
      if (user && user.status === 'active' && !user.isLocked) {
        req.user = {
          id: user._id,
          userId: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId,
          permissions: user.permissions,
          status: user.status
        };
      }
    }
    
    next();
    
  } catch (error) {
    // If optional auth fails, just continue without user info
    next();
  }
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const key = req.ip + (req.body.email || '');
    const now = Date.now();
    
    if (!attempts.has(key)) {
      attempts.set(key, []);
    }
    
    const userAttempts = attempts.get(key);
    
    // Clean old attempts outside the window
    const validAttempts = userAttempts.filter(attempt => now - attempt < windowMs);
    attempts.set(key, validAttempts);
    
    if (validAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000 / 60) // minutes
      });
    }
    
    // Add current attempt
    validAttempts.push(now);
    attempts.set(key, validAttempts);
    
    next();
  };
};

/**
 * Validate refresh token middleware
 */
export const validateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required.'
      });
    }
    
    const decoded = verifyToken(refreshToken, 'refresh');
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type.'
      });
    }
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.'
      });
    }
    
    // Check if refresh token exists in user's refresh tokens
    const tokenExists = user.refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
    
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token.'
      });
    }
    
    req.user = user;
    req.refreshToken = refreshToken;
    
    next();
    
  } catch (error) {
    console.error('Refresh token validation error:', error.message);
    
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token.',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
};

export default {
  authenticate,
  authorize,
  superAdminOnly,
  pharmacyOwnerOnly,
  tenantIsolation,
  checkPermission,
  optionalAuth,
  authRateLimit,
  validateRefreshToken
};