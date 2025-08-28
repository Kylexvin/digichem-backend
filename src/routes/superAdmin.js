import express from 'express';
import { body } from 'express-validator';
import {
  approveApplication,
  rejectApplication,
  getPendingApplications,
  getApplicationById
} from '../controllers/superAdmin/applicationController.js';
import {
  authenticate,
  superAdminOnly,
  
} from '../middleware/authMiddleware.js';


const router = express.Router();

// All admin routes require super admin access
router.use(authenticate);
router.use(superAdminOnly);

// Application Management Routes

/**
 * GET /api/admin/applications/pending
 * Get all pending applications for review
 */
router.get('/pending', getPendingApplications);

/**
 * GET /api/admin/applications/:id
 * Get specific application details
 */
router.get('/:id', superAdminOnly, getApplicationById);

/**
 * POST /api/admin/applications/:id/approve
 * Approve a pharmacy application
 */
router.post(
  '/:id/approve',
  [ // Validation middleware array
    body('subscriptionPlan')
      .isIn(['STANDARD', 'PREMIUM'])
      .withMessage('Subscription plan must be STANDARD or PREMIUM'),
    
    body('agreedMonthlyAmount')
      .isFloat({ min: 100 })
      .withMessage('Agreed monthly amount must be at least 100'),
    
    body('initialPayment.amount')
      .isFloat({ min: 1 })
      .withMessage('Initial payment amount must be greater than 0'),
    
    body('initialPayment.method')
      .notEmpty()
      .withMessage('Payment method is required'),
    
    body('initialPayment.transactionId')
      .notEmpty()
      .withMessage('Transaction ID is required'),
    
    body('customSubdomain')
      .optional()
      .matches(/^[a-z0-9-]+$/)
      .isLength({ min: 3, max: 50 })
      .withMessage('Custom subdomain must contain only lowercase letters, numbers, and hyphens (3-50 chars)')
  ],
  approveApplication
);


/**
 * POST /api/admin/applications/:id/reject
 * Reject a pharmacy application
 */
router.post('/:id/reject', [
  body('reason')
    .isLength({ min: 10 })
    .withMessage('Rejection reason must be at least 10 characters')
], rejectApplication);

// Pharmacy Management Routes

/**
 * GET /api/admin/pharmacies
 * Get all pharmacies with filtering and pagination
 */
router.get('/pharmacies', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      plan,
      county,
      search
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (plan) filters.plan = plan;
    if (county) filters.county = county;

    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    const pharmacies = await Pharmacy.searchPharmacies(search, filters)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalCount = await Pharmacy.countDocuments(
      search ? { $or: [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } }
      ] } : filters
    );

    res.json({
      success: true,
      data: {
        pharmacies,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: page < Math.ceil(totalCount / parseInt(limit)),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pharmacies',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/pharmacies/:id
 * Get specific pharmacy details
 */
router.get('/pharmacies/:id', async (req, res) => {
  try {
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    const pharmacy = await Pharmacy.findById(req.params.id)
      .populate('ownerId', 'firstName lastName email phone status')
      .populate('createdFromApplication')
      .populate('approvedBy', 'firstName lastName email');

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    res.json({
      success: true,
      data: { pharmacy }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pharmacy details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/pharmacies/:id/suspend
 * Suspend a pharmacy
 */
router.post('/pharmacies/:id/suspend', [
  body('reason')
    .isLength({ min: 10 })
    .withMessage('Suspension reason must be at least 10 characters')
], async (req, res) => {
  try {
    const { reason } = req.body;
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    await pharmacy.suspend(reason);

    res.json({
      success: true,
      message: 'Pharmacy suspended successfully',
      data: {
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          status: pharmacy.status,
          suspendedAt: new Date(),
          reason
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to suspend pharmacy',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/pharmacies/:id/reactivate
 * Reactivate a suspended pharmacy
 */
router.post('/pharmacies/:id/reactivate', async (req, res) => {
  try {
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    await pharmacy.reactivate();

    res.json({
      success: true,
      message: 'Pharmacy reactivated successfully',
      data: {
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          status: pharmacy.status,
          reactivatedAt: new Date()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate pharmacy',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Payment & Billing Routes

/**
 * GET /api/admin/payments/overdue
 * Get pharmacies with overdue payments
 */
router.get('/payments/overdue', async (req, res) => {
  try {
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    const overduePharmacies = await Pharmacy.getOverduePayments();

    res.json({
      success: true,
      data: {
        count: overduePharmacies.length,
        pharmacies: overduePharmacies
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overdue payments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/payments/pending
 * Get pharmacies with pending payments
 */
router.get('/payments/pending', async (req, res) => {
  try {
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    const pendingPharmacies = await Pharmacy.getPendingPayments();

    res.json({
      success: true,
      data: {
        count: pendingPharmacies.length,
        pharmacies: pendingPharmacies
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending payments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/pharmacies/:id/payment/mark-overdue
 * Mark a pharmacy payment as overdue
 */
router.post('/pharmacies/:id/payment/mark-overdue', async (req, res) => {
  try {
    const Pharmacy = (await import('../models/Pharmacy.js')).default;
    
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    await pharmacy.markPaymentOverdue();

    res.json({
      success: true,
      message: 'Payment marked as overdue',
      data: {
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          subscriptionStatus: pharmacy.subscription.status
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark payment as overdue',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Dashboard Stats Routes

/**
 * GET /api/admin/dashboard/stats
 * Get admin dashboard statistics
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [Application, Pharmacy, User] = await Promise.all([
      import('../models/Application.js').then(m => m.default),
      import('../models/Pharmacy.js').then(m => m.default),
      import('../models/User.js').then(m => m.default)
    ]);

    const [
      pendingApplications,
      totalPharmacies,
      activePharmacies,
      suspendedPharmacies,
      overduePayments,
      pendingPayments,
      totalUsers,
      recentApplications
    ] = await Promise.all([
      Application.countDocuments({ status: 'pending' }),
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({ status: 'active' }),
      Pharmacy.countDocuments({ status: 'suspended' }),
      Pharmacy.countDocuments({
        'subscription.nextBilling': { $lt: new Date() },
        'subscription.status': 'active',
        status: 'active'
      }),
      Pharmacy.countDocuments({ 'subscription.status': 'pending_payment' }),
      User.countDocuments({ role: { $ne: 'super_admin' } }),
      Application.find({ status: 'pending' }).sort({ submittedAt: -1 }).limit(5)
    ]);

    res.json({
      success: true,
      data: {
        applications: {
          pending: pendingApplications,
          recent: recentApplications
        },
        pharmacies: {
          total: totalPharmacies,
          active: activePharmacies,
          suspended: suspendedPharmacies
        },
        payments: {
          overdue: overduePayments,
          pending: pendingPayments
        },
        users: {
          total: totalUsers
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;