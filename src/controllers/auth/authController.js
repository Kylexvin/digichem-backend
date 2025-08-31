import User from '../../models/User.js';
import {
  generateAccessToken, 
  generateRefreshToken, 
  createTokenResponse 
} from '../../utils/generateToken.js';
import { validationResult } from 'express-validator';

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
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user and include password for comparison
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
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
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
      // Handle failed login
      await user.handleFailedLogin();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        attemptsLeft: Math.max(0, 5 - (user.loginAttempts + 1))
      });
    }

    // Handle successful login
    await user.handleSuccessfulLogin();

    // Generate device info
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: req.get('CF-IPCountry') || 'Unknown'
    };

    // Generate tokens using utils (consistent approach)
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Add refresh token to user's collection and save
    user.addRefreshToken(refreshToken, deviceInfo);
    await user.save();

    // Create response
    const response = {
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
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};



/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = async (req, res) => {
  try {
    const user = req.user; // set by validateRefreshToken middleware
    const oldRefreshToken = req.refreshToken;

    // Remove the old refresh token
    user.removeRefreshToken(oldRefreshToken);

    // Create new device info
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: req.get('CF-IPCountry') || 'Unknown'
    };

    // Generate new refresh token
    const newRefreshToken = user.generateRefreshToken(deviceInfo);

    // Save user with updated refresh token list
    await user.save();

    // Build token response with fresh access token
    const tokenResponse = createTokenResponse(user, deviceInfo);

    // Overwrite refreshToken in response (so frontend gets the correct one)
    tokenResponse.tokens.refreshToken = newRefreshToken;

    return res.json({
      success: true,
      message: 'Token refreshed successfully',
      ...tokenResponse
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
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      const user = await User.findById(req.user.id);
      if (user) {
        user.removeRefreshToken(refreshToken);
        await user.save();
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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