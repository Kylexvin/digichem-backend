import User from '../../models/User.js';
import {
  generateAccessToken, 
  generateRefreshToken, 
  createTokenResponse 
} from '../../utils/generateToken.js';
import { validationResult } from 'express-validator';
import StaffActivity from '../../models/StaffActivity.js';
import jwt from 'jsonwebtoken';
/** 
 * Register Super Admin (First time setup only)
 * POST /api/auth/register-super-admin
 */
export const registerSuperAdmin = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Super admin already exists. Only one super admin allowed.'
      });
    }

    const { firstName, lastName, email, phone, password } = req.body;

    // Create super admin
    const superAdmin = await User.createSuperAdmin({
      firstName,
      lastName,
      email,
      phone,
      password
    });

    // Generate device info
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: 'Initial Setup'
    };

    // Generate tokens using utils
    const accessToken = generateAccessToken(superAdmin);
    const refreshToken = generateRefreshToken(superAdmin);

    // Add refresh token to user's collection and save
    superAdmin.addRefreshToken(refreshToken, deviceInfo);
    await superAdmin.save();

    // Create response
    const response = {
      success: true,
      message: 'Super admin created successfully',
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      },
      user: {
        id: superAdmin._id,
        firstName: superAdmin.firstName,
        lastName: superAdmin.lastName,
        email: superAdmin.email,
        role: superAdmin.role,
        tenantId: superAdmin.tenantId,
        permissions: superAdmin.permissions,
        status: superAdmin.status
      },
      deviceInfo
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('Super admin registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create super admin',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Login for all user types
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    // Validation check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user with password and login metadata
    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked due to failed login attempts.',
        lockUntil: user.lockUntil
      });
    }

    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Please contact support.`
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.handleFailedLogin();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        attemptsLeft: Math.max(0, 5 - (user.loginAttempts + 1))
      });
    }

    // Successful login
    await user.handleSuccessfulLogin();

    // Device info
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: req.get('CF-IPCountry') || 'Unknown'
    };

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.addRefreshToken(refreshToken, deviceInfo);
    await user.save();

    // Record login in StaffActivity ONLY if attendant
    if (user.role === 'attendant') {
  try {
    await StaffActivity.create({
      staff: user._id,
      tenantId: user.tenantId, // <-- use tenantId, not tenant
      action: 'login',
      deviceInfo
    });
  } catch (err) {
    console.error('Failed to log staff login:', err);
  }
}

    // Response
    res.status(200).json({
      success: true,
      message: 'Login successful',
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
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};



export const refreshToken = async (req, res) => {
  try {
    // Get refresh token from Authorization header or request body
    let refreshToken = req.headers.authorization?.replace('Bearer ', '') || req.body.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token using your utility function
    let decoded;
    try {
      decoded = verifyToken(refreshToken, 'refresh');
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Find user using userId from token
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Check if refresh token exists in user's token list
    const tokenExists = user.refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
    
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Remove old refresh token
    user.removeRefreshToken(refreshToken);

    // Create new device info
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: req.get('CF-IPCountry') || 'Unknown'
    };

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Add new refresh token
    user.addRefreshToken(newRefreshToken, deviceInfo);
    await user.save();

    // Return response
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
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
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
/**
 * Logout (invalidate refresh token)
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    // Get refresh token from body or Authorization header
    let refreshToken = req.body.refreshToken || req.headers.authorization?.replace('Bearer ', '');
    
    // Try to find user by refresh token if no authenticated user
    let userId = req.user?.id;
    
    if (!userId && refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        userId = decoded.id;
      } catch (error) {
        // If token is invalid, we can still "succeed" at logout
        console.log('Invalid refresh token during logout, proceeding anyway');
      }
    }
    
    // If we have a user ID, try to remove the refresh token
    if (userId && refreshToken) {
      try {
        const user = await User.findById(userId);
        if (user) {
          user.removeRefreshToken(refreshToken);
          await user.save();
          console.log('Refresh token removed from user');
        }
      } catch (error) {
        console.error('Error removing refresh token:', error);
        // Don't fail logout if token removal fails
      }
    }

    // Always return success for logout
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    // Still return success for logout - we want client to clear its tokens
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
};

/**
 * Logout from all devices (invalidate all refresh tokens)
 * POST /api/auth/logout-all
 */
export const logoutAll = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (user) {
      user.refreshTokens = []; // Clear all refresh tokens
      await user.save();
    }

    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('tenantId', 'name subdomain type subscription status');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
        pharmacy: user.tenantId,
        profilePicture: user.profilePicture,
        language: user.language,
        timezone: user.timezone,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update user profile
 * PUT /api/auth/profile
 */
export const updateProfile = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, phone, language, timezone } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (language) user.language = language;
    if (timezone) user.timezone = timezone;

    user.lastModifiedBy = req.user.id;
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        language: user.language,
        timezone: user.timezone
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Change password
 * PUT /api/auth/change-password
 */
export const changePassword = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    user.lastModifiedBy = req.user.id;
    
    // Clear all refresh tokens to force re-login on all devices
    user.refreshTokens = [];
    
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again on all devices.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get user's active sessions (refresh tokens with device info)
 * GET /api/auth/sessions
 */
export const getSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const sessions = user.refreshTokens.map(tokenObj => ({
      id: tokenObj._id,
      deviceInfo: tokenObj.deviceInfo,
      createdAt: tokenObj.createdAt,
      isCurrentSession: false // You could compare with current request to identify current session
    }));

    res.json({
      success: true,
      sessions,
      total: sessions.length
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Revoke specific session (refresh token)
 * DELETE /api/auth/sessions/:sessionId
 */
export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove specific refresh token
    const initialLength = user.refreshTokens.length;
    user.refreshTokens = user.refreshTokens.filter(
      tokenObj => tokenObj._id.toString() !== sessionId
    );

    if (user.refreshTokens.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export default {
  registerSuperAdmin,
  login,
  refreshToken,
  logout,
  logoutAll,
  getProfile,
  updateProfile,
  changePassword,
  getSessions,
  revokeSession
};