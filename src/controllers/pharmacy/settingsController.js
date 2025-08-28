// src/controllers/pharmacy/settingsController.js - UPDATED
import mongoose from 'mongoose';
import Pharmacy from '../../models/Pharmacy.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';

/**
 * Check pharmacy setup completion status
 * GET /api/pharmacy/setup-status
 */
export const getSetupStatus = async (req, res) => {
  try {
    // Use tenantId from the authenticated user (req.user.tenantId)
    const pharmacy = await Pharmacy.findById(req.user.tenantId)
      .populate('ownerId', 'firstName lastName email')
      .select('name subdomain contact operatingHours subscription settings branding stats');

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    // COUNT ACTUAL PRODUCTS - ADD THIS QUERY
    const productCount = await Product.countDocuments({ 
      pharmacy: req.user.tenantId, 
      status: 'active' 
    });

    // COUNT ACTUAL STAFF - ADD THIS QUERY TOO
    const staffCount = await User.countDocuments({
      tenantId: req.user.tenantId,
      role: 'attendant',
      status: 'active'
    });

    // Check completion status of various setup steps
    const setupStatus = {
      basicInfo: {
        completed: !!pharmacy.name && !!pharmacy.contact?.phone,
        required: true,
        title: 'Basic Information',
        description: 'Pharmacy name and contact details'
      },
      businessHours: {
        completed: !!pharmacy.operatingHours?.weekdays,
        required: true,
        title: 'Business Hours',
        description: 'Set your operating hours'
      },
      branding: {
        completed: !!pharmacy.branding?.primaryColor,
        required: false,
        title: 'Brand Customization',
        description: 'Add your logo and brand colors'
      },
      inventorySetup: {
        completed: productCount > 0, // USE ACTUAL COUNT
        required: true,
        title: 'Inventory Setup',
        description: 'Add your products and stock'
      },
      staffSetup: {
        completed: staffCount > 0, // USE ACTUAL COUNT
        required: false,
        title: 'Staff Accounts',
        description: 'Create accounts for your team'
      },
      paymentSetup: {
        completed: pharmacy.subscription?.status === 'active',
        required: true,
        title: 'Payment Method',
        description: 'Set up your billing information'
      }
    };

    // Calculate overall completion percentage
    const requiredSteps = Object.values(setupStatus).filter(step => step.required);
    const totalRequiredSteps = requiredSteps.length;
    const completedRequiredSteps = requiredSteps.filter(step => step.completed).length;
    const completionPercentage = totalRequiredSteps > 0 
      ? Math.round((completedRequiredSteps / totalRequiredSteps) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          subdomain: pharmacy.subdomain,
          owner: pharmacy.ownerId,
          websiteUrl: `https://${pharmacy.subdomain}.kxbyte.co.ke`,
          stats: {
            totalProducts: productCount, // ADD ACTUAL COUNTS TO RESPONSE
            totalStaff: staffCount
          }
        },
        setupStatus,
        completionPercentage,
        nextSteps: Object.entries(setupStatus)
          .filter(([_, status]) => !status.completed && status.required)
          .map(([key, status]) => ({
            step: key,
            title: status.title,
            description: status.description
          }))
      }
    });

  } catch (error) {
    console.error('Error fetching setup status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch setup status',
      error: error.message
    });
  }
};

/**
 * Update basic pharmacy information
 * PUT /api/pharmacy/basic-info
 */
export const updateBasicInfo = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, phone, email, street, city, county, postalCode } = req.body;

    const updates = {
      name: name?.trim(),
      'contact.phone': phone,
      'contact.email': email,
      'address.street': street,
      'address.city': city,
      'address.county': county,
      'address.postalCode': postalCode
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.user.tenantId, // Use tenantId from authenticated user
      updates,
      { new: true, runValidators: true, session }
    ).select('name contact address');

    if (!pharmacy) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Basic information updated successfully',
      data: { pharmacy }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }

    console.error('Error updating basic info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update basic information',
      error: error.message
    });
  }
};

/**
 * Update pharmacy operating hours
 * PUT /api/pharmacy/operating-hours
 */
export const updateOperatingHours = async (req, res) => {
  try {
    const { weekdays, saturday, sunday, publicHolidays } = req.body;

    const updates = {
      operatingHours: {
        weekdays: weekdays || '8:00 AM - 6:00 PM',
        saturday: saturday || '8:00 AM - 4:00 PM',
        sunday: sunday || '9:00 AM - 3:00 PM',
        publicHolidays: publicHolidays || '9:00 AM - 2:00 PM'
      }
    };

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.user.tenantId, // Use tenantId from authenticated user
      updates,
      { new: true, runValidators: true }
    ).select('operatingHours');

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    res.json({
      success: true,
      message: 'Operating hours updated successfully',
      data: { operatingHours: pharmacy.operatingHours }
    });

  } catch (error) {
    console.error('Error updating operating hours:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update operating hours',
      error: error.message
    });
  }
};