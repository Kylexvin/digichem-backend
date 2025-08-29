// src/controllers/pharmacy/staffController.js
import User from '../../models/User.js';
import Pharmacy from '../../models/Pharmacy.js';
import { sendWelcomeEmail } from '../../services/notificationService.js';

export const createStaff = async (req, res) => {
  try {
    const { email, firstName, lastName, phone, permissions } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email, tenantId: req.user.tenantId });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    
    const staffUser = new User({
      email,
      firstName,
      lastName,
      phone,
      password: tempPassword,
      role: 'attendant',
      tenantId: req.user.tenantId,
      permissions: permissions || {
        sales: true,
        inventory: 'view',
        reports: false,
        customers: 'view',
        settings: false,
        refunds: false,
        discounts: 'none',
        overrideStock: false
      },
      status: 'active',
      createdBy: req.user.id
    });

    await staffUser.save();

    // Send welcome email
    const pharmacy = await Pharmacy.findById(req.user.tenantId);
    await sendWelcomeEmail(email, firstName, tempPassword, pharmacy.name);

    res.status(201).json({
      success: true,
      message: 'Staff account created successfully',
      data: {
        userId: staffUser._id,
        email: staffUser.email,
        tempPassword: tempPassword // Only returned once for initial setup
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create staff account',
      error: error.message
    });
  }
};

export const getStaffList = async (req, res) => {
  try {
    const staff = await User.find({ 
      tenantId: req.user.tenantId,
      role: 'attendant'
    }).select('-password -refreshTokens');

    res.json({
      success: true,
      data: staff
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff list',
      error: error.message
    });
  }
};

export const updateStaffPermissions = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { permissions } = req.body;

    console.log('Received permissions update:', permissions); // ← ADD FOR DEBUGGING

    const staff = await User.findOneAndUpdate(
      { 
        _id: staffId, 
        tenantId: req.user.tenantId,
        role: 'attendant' 
      },
      { permissions },
      { new: true }
    ).select('-password -refreshTokens');

    console.log('Updated staff permissions:', staff.permissions); // ← ADD FOR DEBUGGING

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      data: staff
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update permissions',
      error: error.message
    });
  }
};