import Application from '../../models/Application.js';
import Pharmacy from '../../models/Pharmacy.js';
import User from '../../models/User.js';
// import { generateSubdomain, generateRandomPassword } from '../../utils/generateToken.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';


/**
 * Helper function to generate subdomain from pharmacy name
 */
const generateSubdomain = (pharmacyName) => {
  return pharmacyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
};

/**
 * Submit new pharmacy application
 * POST /api/applications/submit
 */

export const submitApplication = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // 1. Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const applicationData = req.body;

      // 2. Check if application already exists with same email
      const existingApplication = await Application.findOne({
        'owner.email': applicationData.owner.email,
        status: { $in: ['pending', 'approved'] }
      }).session(session);

      if (existingApplication) {
        throw {
          code: 'DUPLICATE_EMAIL',
          message: existingApplication.status === 'approved'
            ? 'A pharmacy is already registered with this email address'
            : 'An application with this email is already pending review'
        };
      }

      // 3. Check if pharmacy name would create conflicting subdomain
      const potentialSubdomain = generateSubdomain(applicationData.pharmacyName);
      const existingPharmacy = await Pharmacy.findOne({ subdomain: potentialSubdomain }).session(session);
      
      if (existingPharmacy) {
        throw {
          code: 'DUPLICATE_PHARMACY',
          message: 'A pharmacy with a similar name already exists. Please choose a different pharmacy name.',
          suggestedAlternatives: [
            `${applicationData.pharmacyName} Pharmacy`,
            `${applicationData.pharmacyName} Plus`,
            `${applicationData.pharmacyName} Care`
          ]
        };
      }

      // 4. Create user first (with pending status)
      const userData = {
        firstName: applicationData.owner.firstName,
        lastName: applicationData.owner.lastName,
        email: applicationData.owner.email.toLowerCase(),
        phone: applicationData.owner.phone,
        role: 'pharmacy_owner',
        status: 'pending', // Will be activated when application is approved
        isEmailVerified: false,
        password: applicationData.owner.password
      };

      const user = await User.create([userData], { session });
      
      // 5. Create application (without password in owner field)
      const applicationDataWithoutPassword = {
        ...applicationData,
        owner: {
          firstName: applicationData.owner.firstName,
          lastName: applicationData.owner.lastName,
          email: applicationData.owner.email.toLowerCase(),
          phone: applicationData.owner.phone
        },
        createdUserId: user[0]._id
      };

      const application = await Application.create([applicationDataWithoutPassword], { session });

      // 6. Send success response
      res.status(201).json({
        success: true,
        message: 'Application submitted successfully! We will review your application within 3-5 business days.',
        data: {
          application: {
            id: application[0]._id,
            applicationId: application[0].applicationId,
            pharmacyName: application[0].pharmacyName,
            ownerName: `${application[0].owner.firstName} ${application[0].owner.lastName}`,
            status: application[0].status,
            submittedAt: application[0].submittedAt,
            estimatedReviewTime: '3-5 business days'
          },
          user: {
            id: user[0]._id,
            email: user[0].email,
            status: user[0].status,
            message: 'User account created (inactive until approval)'
          }
        },
        nextSteps: [
          'Your application is now under review',
          'You will receive an email once your application is processed',
          'If approved, you can log in with the password you set during application',
          'Keep your application ID for reference: ' + application[0].applicationId
        ]
      });
    });
  } catch (error) {
    console.error('Application submission error:', error);

    // Handle custom errors
    if (error.code === 'DUPLICATE_EMAIL' || error.code === 'DUPLICATE_PHARMACY') {
      return res.status(400).json({
        success: false,
        message: error.message,
        suggestions: error.suggestedAlternatives
      });
    }

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = 'This information already exists in our system';
      
      if (field.includes('email')) {
        message = 'An account with this email address already exists';
      }
      
      return res.status(400).json({ success: false, message, field });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Application data validation failed',
        errors: validationErrors
      });
    }

    // Generic fallback
    res.status(500).json({
      success: false,
      message: 'Failed to submit application. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    await session.endSession();
  }
};
/**
 * Approve a pending pharmacy application
 * POST /api/applications/:id/approve
 */
export const approveApplication = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Find application with createdUserId populated
    const application = await Application.findById(id)
      .populate('createdUserId')
      .session(session);

    if (!application) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Application already processed'
      });
    }

    // Generate subdomain from pharmacy name
    const subdomain = generateSubdomain(application.pharmacyName);

    // Create Pharmacy with required subscription data
    const newPharmacy = new Pharmacy({
      name: application.pharmacyName,
      subdomain: subdomain,
      type: application.pharmacyType,
      ownerId: application.createdUserId._id,
      address: {
        street: application.address.street,
        city: application.address.city,
        county: application.address.county,
        postalCode: application.address.postalCode
      },
      coordinates: application.coordinates,
      contact: {
        phone: application.owner.phone,
        email: application.owner.email
      },
      operatingHours: application.operatingHours,
      // Required subscription fields - set defaults for approval
      subscription: {
        plan: 'STANDARD', // Default plan
        status: 'active',
        startDate: new Date(),
        agreedMonthlyAmount: 2500, // Default amount - should be set by admin
        initialPayment: {
          amount: 0, // Can be 0 for now, updated later
          date: new Date(),
          method: 'pending',
          transactionId: `INIT-${Date.now()}`
        },
        paymentAgreed: true, // Set to true for approval
        agreedDate: new Date()
      },
      createdFromApplication: application._id,
      approvedBy: req.user.id,
      approvedAt: new Date()
    });

    const savedPharmacy = await newPharmacy.save({ session });

    // Update Application status
    application.status = 'approved';
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();
    application.reviewNotes = 'Application approved successfully';
    application.createdPharmacyId = savedPharmacy._id;
    await application.save({ session });

    // Update User (and return fresh doc)
    const updatedUser = await User.findByIdAndUpdate(
      application.createdUserId._id,
      {
        status: 'active',
        tenantId: savedPharmacy._id,
        isEmailVerified: true,
        lastModifiedBy: req.user.id
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Application approved successfully',
      data: {
        application,
        pharmacy: savedPharmacy,
        user: updatedUser
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error approving application:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve application. Please try again.',
      error: error.message
    });
  }
};


/**
 * Reject a pending pharmacy application
 * POST /api/applications/:id/reject
 */
export const rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required and must be at least 10 characters'
      });
    }

    const application = await Application.findById(id).populate('createdUserId');
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Application has already been ${application.status}`
      });
    }

    // Reject the application
    const rejectedApplication = await application.reject(req.user.id);

    // Optionally store rejection reason (you might want to add this field to Application model)
    // rejectedApplication.rejectionReason = reason;
    // await rejectedApplication.save();

    res.status(200).json({
      success: true,
      message: 'Application rejected successfully',
      data: {
        application: {
          id: rejectedApplication._id,
          applicationId: rejectedApplication.applicationId,
          status: rejectedApplication.status,
          rejectedAt: rejectedApplication.reviewedAt,
          reason: reason
        },
        owner: {
          id: application.createdUserId._id,
          name: application.createdUserId.fullName,
          email: application.createdUserId.email,
          status: application.createdUserId.status // Should be 'inactive' after rejection
        }
      },
      nextSteps: [
        'Applicant has been notified of rejection',
        'User account has been deactivated',
        'They can submit a new application if they address the issues',
        'Rejection reason: ' + reason
      ]
    });

  } catch (error) {
    console.error('Application rejection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject application. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get pending applications for admin review
 * GET /api/applications/pending
 */
export const getPendingApplications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const applications = await Application.getPendingApplications(page, limit);
    const totalCount = await Application.countDocuments({ status: 'pending' });

    res.status(200).json({
      success: true,
      data: {
        applications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1
        }
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
 * Get application details by ID
 * GET /api/applications/:id
 */
export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await Application.findById(id)
      .populate('createdUserId', 'firstName lastName email phone status')
      .populate('reviewedBy', 'firstName lastName email')
      .populate('createdPharmacyId', 'name subdomain websiteUrl status');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { application }
    });

  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application details',
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



export default {
  submitApplication,

  getPendingApplications,
 
  approveApplication,
  rejectApplication,
  
  getApplicationStats,
  searchApplications,
  
};