import Application from '../../models/Application.js';
import Pharmacy from '../../models/Pharmacy.js';
import User from '../../models/User.js';
import { generateSubdomain, generateRandomPassword } from '../../utils/generateToken.js';
import { validationResult } from 'express-validator';


/**
 * Submit new pharmacy application
 * POST /api/applications/submit
 */
export const submitApplication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const applicationData = req.body;

    // Check if application already exists with same email
    const existingApplication = await Application.findOne({
      'owner.email': applicationData.owner.email,
      status: { $in: ['pending', 'under_review', 'approved'] }
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: existingApplication.status === 'approved'
          ? 'A pharmacy is already registered with this email'
          : 'An application with this email is already pending review'
      });
    }

    // Create new application
    const application = new Application(applicationData);
    await application.save();

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: {
        id: application._id,
        applicationId: application.applicationId,
        pharmacyName: application.pharmacyName,
        ownerName: application.fullOwnerName,
        status: application.status,
        submittedAt: application.submittedAt
      }
    });

  } catch (error) {
    console.error('Application submission error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit application',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


/**
 * Get all applications (Super Admin only)
 * GET /api/applications
 */
export const getAllApplications = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    let query = {};

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search functionality
    if (search) {
      query = await Application.searchApplications(search, query);
      // Since searchApplications returns a query object, we need to extract the find conditions
      const searchResults = await query;
      return res.json({
        success: true,
        applications: searchResults,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(searchResults.length / parseInt(limit)),
          totalApplications: searchResults.length,
          hasNext: parseInt(page) * parseInt(limit) < searchResults.length,
          hasPrev: parseInt(page) > 1
        }
      });
    }

    // Regular pagination query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [applications, totalCount] = await Promise.all([
      Application.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reviewedBy', 'firstName lastName email')
        .lean(),
      Application.countDocuments(query)
    ]);

    res.json({
      success: true,
      applications: applications.map(app => ({
        ...app,
        fullOwnerName: `${app.owner.firstName} ${app.owner.lastName}`,
        fullAddress: `${app.address.street}, ${app.address.city}, ${app.address.county}`,
        daysWaiting: Math.floor((new Date() - app.submittedAt) / (1000 * 60 * 60 * 24))
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalApplications: totalCount,
        hasNext: parseInt(page) * parseInt(limit) < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get pending applications (Super Admin only)
 * GET /api/applications/pending
 */
export const getPendingApplications = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const applications = await Application.getPendingApplications(parseInt(page), parseInt(limit));
    const totalCount = await Application.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      applications: applications.map(app => ({
        id: app._id,
        applicationId: app.applicationId,
        pharmacyName: app.pharmacyName,
        pharmacyType: app.pharmacyType,
        owner: {
          name: `${app.owner.firstName} ${app.owner.lastName}`,
          email: app.owner.email,
          phone: app.owner.phone
        },
        address: {
          full: `${app.address.street}, ${app.address.city}, ${app.address.county}`
        },
        licenseNumber: app.licenseNumber,
        licenseExpiry: app.licenseExpiry,
        submittedAt: app.submittedAt,
        daysWaiting: app.daysWaiting,
        priority: app.priority,
        estimatedMonthlyRevenue: app.estimatedMonthlyRevenue,
        numberOfStaff: app.numberOfStaff
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalApplications: totalCount
      }
    });

  } catch (error) {
    console.error('Get pending applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get single application details
 * GET /api/applications/:id
 */
export const getApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await Application.findById(id)
      .populate('reviewedBy', 'firstName lastName email')
      .populate('generatedPharmacyId', 'name subdomain')
      .populate('generatedOwnerId', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      application: {
        ...application.toJSON(),
        canBeEdited: application.canBeEdited(),
        missingDocuments: application.getMissingDocuments()
      }
    });

  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Start review process (Super Admin only)
 * PUT /api/applications/:id/start-review
 */
export const startReview = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot start review. Application is currently ${application.status}`
      });
    }

    await application.startReview(req.user.id);

    res.json({
      success: true,
      message: 'Application review started',
      application: {
        id: application._id,
        status: application.status,
        reviewedBy: req.user.firstName + ' ' + req.user.lastName,
        reviewedAt: application.reviewedAt
      }
    });

  } catch (error) {
    console.error('Start review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start review',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Approve application and create pharmacy (Super Admin only)
 * POST /api/applications/:id/approve
 */
export const approveApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes = '' } = req.body;

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (!['pending', 'under_review'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve application. Current status: ${application.status}`
      });
    }

    // Start transaction-like process
    try {
      // 1. Generate unique subdomain
      const subdomain = generateSubdomain(application.pharmacyName);

      // 2. Create Pharmacy
      const pharmacy = new Pharmacy({
        name: application.pharmacyName,
        subdomain: subdomain,
        type: application.pharmacyType,
        licenseNumber: application.licenseNumber,
        licenseExpiry: application.licenseExpiry,
        address: application.address,
        coordinates: application.coordinates,
        contact: {
          phone: application.owner.phone,
          email: application.owner.email
        },
        businessRegistration: application.businessRegistration,
        taxPin: application.taxPin,
        createdFromApplication: application._id,
        approvedBy: req.user.id
      });

      await pharmacy.save();

      // 3. Generate password for pharmacy owner
      const ownerPassword = generateRandomPassword(12);

      // 4. Create Pharmacy Owner User
      const pharmacyOwner = await User.createPharmacyOwner({
        firstName: application.owner.firstName,
        lastName: application.owner.lastName,
        email: application.owner.email,
        phone: application.owner.phone,
        password: ownerPassword
      }, pharmacy._id);

      // 5. Update pharmacy with owner ID
      pharmacy.ownerId = pharmacyOwner._id;
      await pharmacy.save();

      // 6. Approve application and link created records
      application.generatedPharmacyId = pharmacy._id;
      application.generatedOwnerId = pharmacyOwner._id;
      await application.approve(req.user.id, notes);

      // TODO: Send welcome email to pharmacy owner with login credentials
      // await sendWelcomeEmail(pharmacyOwner.email, {
      //   pharmacyName: pharmacy.name,
      //   subdomain: pharmacy.subdomain,
      //   email: pharmacyOwner.email,
      //   password: ownerPassword,
      //   loginUrl: `https://${pharmacy.subdomain}.kxbyte.com/login`
      // });

      res.json({
        success: true,
        message: 'Application approved successfully',
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          subdomain: pharmacy.subdomain,
          websiteUrl: pharmacy.websiteUrl,
          ownerId: pharmacyOwner._id
        },
        owner: {
          id: pharmacyOwner._id,
          name: pharmacyOwner.fullName,
          email: pharmacyOwner.email,
          temporaryPassword: ownerPassword // Remove this in production, send via email only
        },
        application: {
          id: application._id,
          status: application.status,
          approvedAt: application.reviewedAt
        }
      });

    } catch (creationError) {
      console.error('Error during pharmacy/owner creation:', creationError);
      
      // Cleanup: If pharmacy was created but owner failed, delete pharmacy
      if (creationError.message.includes('pharmacy') && pharmacy) {
        await Pharmacy.findByIdAndDelete(pharmacy._id);
      }
      
      throw creationError;
    }

  } catch (error) {
    console.error('Approve application error:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field.includes('subdomain') ? 'Subdomain' : 'License/Email'} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to approve application',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Reject application (Super Admin only)
 * POST /api/applications/:id/reject
 */
export const rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes = '' } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (!['pending', 'under_review'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject application. Current status: ${application.status}`
      });
    }

    await application.reject(req.user.id, reason, notes);

    // TODO: Send rejection email to applicant
    // await sendRejectionEmail(application.owner.email, {
    //   pharmacyName: application.pharmacyName,
    //   reason: reason,
    //   notes: notes,
    //   reapplyUrl: `${process.env.FRONTEND_URL}/apply`
    // });

    res.json({
      success: true,
      message: 'Application rejected',
      application: {
        id: application._id,
        status: application.status,
        rejectionReason: application.rejectionReason,
        reviewNotes: application.reviewNotes,
        rejectedAt: application.reviewedAt,
        rejectedBy: `${req.user.firstName} ${req.user.lastName}`
      }
    });

  } catch (error) {
    console.error('Reject application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject application',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Mark application as incomplete (Super Admin only)
 * POST /api/applications/:id/incomplete
 */
export const markIncomplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes = '' } = req.body;

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (!['pending', 'under_review'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as incomplete. Current status: ${application.status}`
      });
    }

    await application.markIncomplete(req.user.id, notes);

    // TODO: Send incomplete application email
    // await sendIncompleteEmail(application.owner.email, {
    //   pharmacyName: application.pharmacyName,
    //   notes: notes,
    //   missingDocuments: application.getMissingDocuments(),
    //   editUrl: `${process.env.FRONTEND_URL}/application/edit/${application._id}`
    // });

    res.json({
      success: true,
      message: 'Application marked as incomplete',
      application: {
        id: application._id,
        status: application.status,
        reviewNotes: application.reviewNotes,
        followUpRequired: application.followUpRequired,
        followUpDate: application.followUpDate,
        missingDocuments: application.getMissingDocuments()
      }
    });

  } catch (error) {
    console.error('Mark incomplete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark application as incomplete',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update application priority (Super Admin only)
 * PUT /api/applications/:id/priority
 */
export const updatePriority = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level'
      });
    }

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    application.priority = priority;
    await application.save();

    res.json({
      success: true,
      message: 'Priority updated successfully',
      application: {
        id: application._id,
        priority: application.priority
      }
    });

  } catch (error) {
    console.error('Update priority error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update priority',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get application statistics (Super Admin only)
 * GET /api/applications/stats
 */
export const getApplicationStats = async (req, res) => {
  try {
    const [
      totalApplications,
      pendingApplications,
      underReviewApplications,
      approvedApplications,
      rejectedApplications,
      incompleteApplications,
      thisMonthApplications,
      lastMonthApplications
    ] = await Promise.all([
      Application.countDocuments(),
      Application.countDocuments({ status: 'pending' }),
      Application.countDocuments({ status: 'under_review' }),
      Application.countDocuments({ status: 'approved' }),
      Application.countDocuments({ status: 'rejected' }),
      Application.countDocuments({ status: 'incomplete' }),
      Application.countDocuments({
        submittedAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }),
      Application.countDocuments({
        submittedAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
          $lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      })
    ]);

    // Calculate approval rate
    const processedApplications = approvedApplications + rejectedApplications;
    const approvalRate = processedApplications > 0 ? (approvedApplications / processedApplications * 100) : 0;

    // Calculate month-over-month growth
    const growthRate = lastMonthApplications > 0 
      ? ((thisMonthApplications - lastMonthApplications) / lastMonthApplications * 100) 
      : 0;

    // Get oldest pending application
    const oldestPending = await Application.findOne({ status: 'pending' })
      .sort({ submittedAt: 1 })
      .select('submittedAt pharmacyName');

    // Get recent activity
    const recentActivity = await Application.find({
      status: { $in: ['approved', 'rejected'] },
      reviewedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
      .sort({ reviewedAt: -1 })
      .limit(5)
      .populate('reviewedBy', 'firstName lastName')
      .select('pharmacyName status reviewedAt reviewedBy');

    res.json({
      success: true,
      stats: {
        total: totalApplications,
        byStatus: {
          pending: pendingApplications,
          underReview: underReviewApplications,
          approved: approvedApplications,
          rejected: rejectedApplications,
          incomplete: incompleteApplications
        },
        metrics: {
          approvalRate: Math.round(approvalRate * 100) / 100,
          thisMonth: thisMonthApplications,
          lastMonth: lastMonthApplications,
          growthRate: Math.round(growthRate * 100) / 100
        },
        oldestPending: oldestPending ? {
          name: oldestPending.pharmacyName,
          daysWaiting: Math.floor((new Date() - oldestPending.submittedAt) / (1000 * 60 * 60 * 24))
        } : null,
        recentActivity: recentActivity.map(app => ({
          pharmacyName: app.pharmacyName,
          status: app.status,
          reviewedAt: app.reviewedAt,
          reviewedBy: app.reviewedBy ? `${app.reviewedBy.firstName} ${app.reviewedBy.lastName}` : 'Unknown'
        }))
      }
    });

  } catch (error) {
    console.error('Get application stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Search applications (Super Admin only)
 * GET /api/applications/search
 */
export const searchApplications = async (req, res) => {
  try {
    const { q: query, status, type, county, limit = 20 } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const filters = {};
    if (status && status !== 'all') filters.status = status;
    if (type && type !== 'all') filters.pharmacyType = type;
    if (county && county !== 'all') filters.county = county;

    const applications = await Application.searchApplications(query, filters);
    const limitedResults = applications.slice(0, parseInt(limit));

    res.json({
      success: true,
      query,
      results: limitedResults.map(app => ({
        id: app._id,
        applicationId: app.applicationId,
        pharmacyName: app.pharmacyName,
        pharmacyType: app.pharmacyType,
        ownerName: `${app.owner.firstName} ${app.owner.lastName}`,
        ownerEmail: app.owner.email,
        licenseNumber: app.licenseNumber,
        status: app.status,
        submittedAt: app.submittedAt,
        address: `${app.address.city}, ${app.address.county}`,
        daysWaiting: Math.floor((new Date() - app.submittedAt) / (1000 * 60 * 60 * 24))
      })),
      total: limitedResults.length,
      hasMore: applications.length > parseInt(limit)
    });

  } catch (error) {
    console.error('Search applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get applications requiring follow-up (Super Admin only)
 * GET /api/applications/follow-up
 */
export const getFollowUpApplications = async (req, res) => {
  try {
    const applications = await Application.find({
      followUpRequired: true,
      followUpDate: { $lte: new Date() },
      status: 'incomplete'
    })
      .sort({ followUpDate: 1 })
      .populate('reviewedBy', 'firstName lastName email')
      .limit(50);

    res.json({
      success: true,
      applications: applications.map(app => ({
        id: app._id,
        applicationId: app.applicationId,
        pharmacyName: app.pharmacyName,
        ownerName: `${app.owner.firstName} ${app.owner.lastName}`,
        ownerEmail: app.owner.email,
        followUpDate: app.followUpDate,
        daysPastDue: Math.floor((new Date() - app.followUpDate) / (1000 * 60 * 60 * 24)),
        reviewNotes: app.reviewNotes,
        followUpNotes: app.followUpNotes,
        lastContact: app.reviewedAt
      })),
      total: applications.length
    });

  } catch (error) {
    console.error('Get follow-up applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch follow-up applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export default {
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
};