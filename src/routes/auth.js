import express from 'express';
import { body } from 'express-validator';
import {
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
} from '../controllers/auth/authController.js';
import {
  authenticate,
  validateRefreshToken,
  authRateLimit
} from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register-super-admin
 * @desc    Register first super admin (one-time setup)
 * @access  Public (but only works if no super admin exists)
 */
router.post('/register-super-admin',
  [
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
    body('phone')
      .matches(/^(?:\+254|0)?[17]\d{8}$/)
      .withMessage('Please enter a valid Kenyan phone number'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
  ],
  registerSuperAdmin
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user (all roles)
 * @access  Public
 */
router.post('/login',
  authRateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  login
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (but requires valid refresh token)
 */
router.post('/refresh',
  validateRefreshToken,
  refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Private
 */
router.post('/logout',
  authenticate,
  logout
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all',
  authenticate,
  logoutAll
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me',
  authenticate,
  getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile',
  authenticate,
  [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('phone')
      .optional()
      .matches(/^(?:\+254|0)?[17]\d{8}$/)
      .withMessage('Please enter a valid Kenyan phone number'),
    body('language')
      .optional()
      .isIn(['en', 'sw'])
      .withMessage('Language must be either en or sw'),
    body('timezone')
      .optional()
      .isString()
      .withMessage('Timezone must be a valid string')
  ],
  updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password',
  authenticate,
  authRateLimit(3, 30 * 60 * 1000), // 3 attempts per 30 minutes
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match new password');
        }
        return true;
      })
  ],
  changePassword
);

/**
 * @route   GET /api/auth/sessions
 * @desc    Get user's active sessions
 * @access  Private
 */
router.get('/sessions',
  authenticate,
  getSessions
);

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Revoke specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId',
  authenticate,
  revokeSession
);

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verify if current token is valid (for frontend)
 * @access  Private
 */
router.get('/verify-token',
  authenticate,
  (req, res) => {
    res.json({
      success: true,
      message: 'Token is valid',
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        tenantId: req.user.tenantId
      }
    });
  }
);

export default router;