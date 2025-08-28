import express from 'express';
import { body } from 'express-validator';
import {
  getDashboard,
  getProfile,
  updateProfile,
  updateBranding,
  getStaff,
  getSubscription,
  updateSettings,
  getAnalytics,
  testAccess
} from '../controllers/pharmacy/dashboardController.js';

// Import middlewares
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  identifyTenant,
  enforceTenantIsolation,
  checkSubscription,
  updatePharmacyActivity
} from '../middleware/tenantMiddleware.js';

const router = express.Router();

// All routes require authentication and tenant identification
router.use(authenticate);
router.use(identifyTenant);

// Only pharmacy owners can access these routes
router.use(authorize('pharmacy_owner'));

// Enforce tenant isolation (ensures pharmacy owners can only access their own data)
router.use(enforceTenantIsolation);

// Check subscription status for all routes
router.use(checkSubscription);

// Update pharmacy activity on all requests
router.use(updatePharmacyActivity);

/**
 * Dashboard Routes
 */

// Get pharmacy dashboard overview
router.get('/dashboard', getDashboard);

// Test access (development helper)
router.get('/test', testAccess);

/**
 * Profile & Settings Routes
 */

// Get pharmacy profile
router.get('/profile', getProfile);

// Update pharmacy profile
router.put('/profile', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Pharmacy name must be between 2 and 100 characters'),
  
  body('address.street')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('address.city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('address.county')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('County is required'),
  
  body('contact.phone')
    .optional()
    .matches(/^(?:\+254|0)?[17]\d{8}$/)
    .withMessage('Please enter a valid Kenyan phone number'),
  
  body('contact.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  body('operatingHours.weekdays')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('Invalid operating hours format'),
  
  body('operatingHours.saturday')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('Invalid operating hours format'),
  
  body('operatingHours.sunday')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('Invalid operating hours format')
], updateProfile);

// Update pharmacy settings
router.put('/settings', [
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Currency must be KES, USD, or EUR'),
  
  body('timezone')
    .optional()
    .isIn(['Africa/Nairobi', 'UTC'])
    .withMessage('Invalid timezone'),
  
  body('language')
    .optional()
    .isIn(['en', 'sw'])
    .withMessage('Language must be en or sw'),
  
  body('lowStockAlert')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Low stock alert must be between 1 and 1000'),
  
  body('expiryAlert')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Expiry alert must be between 1 and 365 days')
], updateSettings);

/**
 * Branding Routes
 */

// Update pharmacy branding
router.put('/branding', [
  body('logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  
  body('primaryColor')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Primary color must be a valid hex color'),
  
  body('theme')
    .optional()
    .isIn(['light', 'dark'])
    .withMessage('Theme must be light or dark')
], updateBranding);

/**
 * Staff Management Routes
 */

// Get pharmacy staff
router.get('/staff', getStaff);

// Note: Staff creation, update, delete routes would go here
// You'll implement these when you build the staff management feature

/**
 * Subscription Routes
 */

// Get subscription information
router.get('/subscription', getSubscription);

// Note: Subscription upgrade/downgrade routes would go here
// You'll implement these when you build the subscription management feature

/**
 * Analytics Routes
 */

// Get pharmacy analytics
router.get('/analytics', [
  // Validate query parameters
  body('period')
    .optional()
    .isIn(['7d', '30d', '90d', '365d'])
    .withMessage('Period must be 7d, 30d, 90d, or 365d')
], getAnalytics);

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  console.error('Pharmacy routes error:', error);
  
  // Handle validation errors
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON format'
    });
  }
  
  // Handle other errors
  res.status(500).json({
    success: false,
    message: 'Internal server error in pharmacy routes',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

export default router;