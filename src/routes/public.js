import express from 'express';
import { body, query } from 'express-validator';
import {
  submitApplication,
  getAllApplications,
  getPendingApplications,
  getApplication,
  startReview,
  approveApplication,
  rejectApplication,
  markIncomplete,
  updatePriority,
  getApplicationStats,
  searchApplications,
  getFollowUpApplications 
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
router.post('/submit',
  authRateLimit(3, 60 * 60 * 1000), // 3 applications per hour per IP
  [
    // Pharmacy Information
    body('pharmacyName')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Pharmacy name must be between 3 and 100 characters'),
    body('pharmacyType')
      .isIn(['retail', 'hospital', 'clinic', 'wholesale', 'online'])
      .withMessage('Invalid pharmacy type'),
    
    // License Information
    body('licenseNumber')
      .trim()
      .matches(/^[A-Z]{2}[0-9]{4,8}$/)
      .withMessage('License number must be in format: PH202401'),
    body('licenseExpiry')
      .isISO8601()
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error('License must not be expired');
        }
        return true;
      }),
    
    // Address Information
    body('address.street')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Street address must be between 5 and 200 characters'),
    body('address.city')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('City must be between 2 and 50 characters'),
    body('address.county')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('County must be between 2 and 50 characters'),
    
    // Owner Information
    body('owner.firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Owner first name must be between 2 and 50 characters'),
    body('owner.lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Owner last name must be between 2 and 50 characters'),
    body('owner.email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),
    body('owner.phone')
      .matches(/^(?:\+254|0)?[17]\d{8}$/)
      .withMessage('Please enter a valid Kenyan phone number'),
    body('owner.nationalId')
      .matches(/^\d{7,8}$/)
      .withMessage('Please enter a valid National ID number'),
    body('owner.qualifications')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Qualifications must be between 10 and 500 characters'),
    
    // Business Information
    body('estimatedMonthlyRevenue')
      .isIn(['0-50k', '50k-200k', '200k-500k', '500k-1M', '1M+'])
      .withMessage('Invalid revenue range'),
    body('numberOfStaff')
      .isInt({ min: 1, max: 100 })
      .withMessage('Number of staff must be between 1 and 100'),
    
    // Documents (optional validation - in real app, you'd handle file uploads)
    body('documents.pharmacyLicense')
      .optional()
      .isString()
      .withMessage('Pharmacy license document path required'),
    body('documents.businessPermit')
      .optional()
      .isString()
      .withMessage('Business permit document path required'),
    body('documents.ownerIdCopy')
      .optional()
      .isString()
      .withMessage('Owner ID copy document path required')
  ],
  submitApplication
);

/**
 * @route   GET /api/applications
 * @desc    Get all applications with filtering and pagination
 * @access  Private (Super Admin only)
 */
router.get('/',
  authenticate,
  superAdminOnly,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['all', 'pending', 'under_review', 'approved', 'rejected', 'incomplete'])
      .withMessage('Invalid status filter'),
    query('sortBy')
      .optional()
      .isIn(['submittedAt', 'pharmacyName', 'status', 'reviewedAt'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  getAllApplications
);

/**
 * @route   GET /api/applications/pending
 * @desc    Get pending applications
 * @access  Private (Super Admin only)
 */
router.get('/pending',
  authenticate,
  superAdminOnly,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  getPendingApplications
);

/**
 * @route   GET /api/applications/stats
 * @desc    Get application statistics
 * @access  Private (Super Admin only)
 */
router.get('/stats',
  authenticate,
  superAdminOnly,
  getApplicationStats
);

/**
 * @route   GET /api/applications/search
 * @desc    Search applications
 * @access  Private (Super Admin only)
 */
router.get('/search',
  authenticate,
  superAdminOnly,
  [
    query('q')
      .isLength({ min: 2, max: 100 })
      .withMessage('Search query must be between 2 and 100 characters'),
    query('status')
      .optional()
      .isIn(['all', 'pending', 'under_review', 'approved', 'rejected', 'incomplete'])
      .withMessage('Invalid status filter'),
    query('type')
      .optional()
      .isIn(['all', 'retail', 'hospital', 'clinic', 'wholesale', 'online'])
      .withMessage('Invalid pharmacy type filter'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  searchApplications
);

/**
 * @route   GET /api/applications/follow-up
 * @desc    Get applications requiring follow-up
 * @access  Private (Super Admin only)
 */
router.get('/follow-up',
  authenticate,
  superAdminOnly,
  getFollowUpApplications
);

/**
 * @route   GET /api/applications/:id
 * @desc    Get single application details
 * @access  Private (Super Admin only)
 */
router.get('/:id',
  authenticate,
  superAdminOnly,
  getApplication
);

/**
 * @route   PUT /api/applications/:id/start-review
 * @desc    Start reviewing an application
 * @access  Private (Super Admin only)
 */
router.put('/:id/start-review',
  authenticate,
  superAdminOnly,
  startReview
);

/**
 * @route   POST /api/applications/:id/approve
 * @desc    Approve application and create pharmacy
 * @access  Private (Super Admin only)
 */
router.post('/:id/approve',
  authenticate,
  superAdminOnly,
  [
    body('notes')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot exceed 1000 characters')
  ],
  approveApplication
);

/**
 * @route   POST /api/applications/:id/reject
 * @desc    Reject application
 * @access  Private (Super Admin only)
 */
router.post('/:id/reject',
  authenticate,
  superAdminOnly,
  [
    body('reason')
      .isIn([
        'invalid_license',
        'expired_documents',
        'incomplete_application',
        'invalid_qualifications',
        'duplicate_application',
        'non_compliance',
        'other'
      ])
      .withMessage('Invalid rejection reason'),
    body('notes')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot exceed 1000 characters')
  ],
  rejectApplication
);

/**
 * @route   POST /api/applications/:id/incomplete
 * @desc    Mark application as incomplete
 * @access  Private (Super Admin only)
 */
router.post('/:id/incomplete',
  authenticate,
  superAdminOnly,
  [
    body('notes')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Notes must be between 10 and 1000 characters when marking as incomplete')
  ],
  markIncomplete
);

/**
 * @route   PUT /api/applications/:id/priority
 * @desc    Update application priority
 * @access  Private (Super Admin only)
 */
router.put('/:id/priority',
  authenticate,
  superAdminOnly,
  [
    body('priority')
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent')
  ],
  updatePriority
);

export default router;