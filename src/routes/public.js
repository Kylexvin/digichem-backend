import express from 'express';
import { body, query } from 'express-validator';
import {
  submitApplication,

} from '../controllers/superAdmin/applicationController.js';
import {
  authenticate,
  superAdminOnly,
  authRateLimit
} from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/applications/submit
 * @desc    Submit new pharmacy application
 * @access  Public (no authentication required)
 */
router.post(
  '/submit',
  authRateLimit(3, 60 * 60 * 1000), // 3 applications per hour per IP
  [
    // Pharmacy Information
    body('pharmacyName')
      .trim()
      .escape()
      .isLength({ min: 3, max: 100 })
      .withMessage('Pharmacy name must be between 3 and 100 characters'),

    body('pharmacyType')
      .trim()
      .toLowerCase()
      .isIn(['retail', 'hospital', 'clinic', 'wholesale'])
      .withMessage('Invalid pharmacy type'),

    // Address
    body('address.street')
      .trim()
      .escape()
      .isLength({ min: 5, max: 200 })
      .withMessage('Street address must be between 5 and 200 characters'),

    body('address.city')
      .trim()
      .escape()
      .isLength({ min: 2, max: 50 })
      .withMessage('City must be between 2 and 50 characters'),

    body('address.county')
      .trim()
      .escape()
      .isLength({ min: 2, max: 50 })
      .withMessage('County must be between 2 and 50 characters'),

    body('address.postalCode')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 20 })
      .withMessage('Postal code too long'),

    // Coordinates (optional)
    body('coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),

    body('coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),

    // Owner
    body('owner.firstName')
      .trim()
      .escape()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),

    body('owner.lastName')
      .trim()
      .escape()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),

    body('owner.email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),

    body('owner.phone')
      .matches(/^(?:\+254|0)?[17]\d{8}$/)
      .withMessage('Please enter a valid Kenyan phone number')
  ],
  submitApplication
);




export default router;