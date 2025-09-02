// src/controllers/pharmacy/staffController.js
import User from '../../models/User.js';
import Pharmacy from '../../models/Pharmacy.js';
import Sale from '../../models/Sale.js';
import mongoose from 'mongoose';
import StaffActivity from '../../models/StaffActivity.js';
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


/**
 * Get quick staff overview for dashboard with recent activities
 * @route GET /api/pharmacy/staff/overview
 * @access Private (Pharmacy owner only)
 */
export const getStaffOverview = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    const { timeRange = 'week' } = req.query;

    // Calculate start date based on timeRange
    const now = new Date();
    const startDate = new Date();
    switch (timeRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get all active staff members
    const staffMembers = await User.find({
      tenantId: pharmacyId,
      role: 'attendant',
      status: 'active'
    }).select('firstName lastName email phone permissions lastLogin createdAt');

    // Get sales performance metrics
    const salesData = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: startDate, $lte: now },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$attendant',
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          averageTransaction: { $avg: '$totalAmount' },
          lastSaleDate: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'attendantInfo'
        }
      },
      { $unwind: '$attendantInfo' },
      {
        $project: {
          attendantId: '$_id',
          firstName: '$attendantInfo.firstName',
          lastName: '$attendantInfo.lastName',
          totalSales: 1,
          transactionCount: 1,
          averageTransaction: 1,
          lastSaleDate: 1
        }
      }
    ]);

    // Get recent staff activities
    const activityLogs = await StaffActivity.find({
      tenantId: pharmacyId,
      createdAt: { $gte: startDate, $lte: now }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('staff', 'firstName lastName');

    const activitiesByStaff = activityLogs.reduce((acc, activity) => {
      const staffId = activity.staff._id.toString();
      if (!acc[staffId]) acc[staffId] = [];
      acc[staffId].push({
        action: activity.action,
        details: activity.details,
        createdAt: activity.createdAt
      });
      return acc;
    }, {});

    // Get pharmacy limits
    const pharmacy = await Pharmacy.findById(pharmacyId).select('features.maxStaff');
    const maxStaff = pharmacy?.features?.maxStaff || 10;

    // Active staff in last 30 mins
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeStaffCount = await User.countDocuments({
      tenantId: pharmacyId,
      role: 'attendant',
      status: 'active',
      lastLogin: { $gte: thirtyMinutesAgo }
    });

    // Compile staff overview
    const staffPerformance = staffMembers.map(staff => {
      const salesStats = salesData.find(s => s.attendantId.toString() === staff._id.toString()) || {
        totalSales: 0,
        transactionCount: 0,
        averageTransaction: 0,
        lastSaleDate: null
      };

      return {
        _id: staff._id,
        name: `${staff.firstName} ${staff.lastName}`,
        email: staff.email,
        phone: staff.phone,
        lastLogin: staff.lastLogin,
        isActive: staff.lastLogin && staff.lastLogin >= thirtyMinutesAgo,
        performance: {
          totalSales: salesStats.totalSales,
          transactionCount: salesStats.transactionCount,
          averageTransaction: Math.round(salesStats.averageTransaction || 0),
          lastSaleDate: salesStats.lastSaleDate
        },
        recentActivities: activitiesByStaff[staff._id.toString()] || [],
        permissions: staff.permissions,
        memberSince: staff.createdAt
      };
    });

    // Sort by total sales descending
    staffPerformance.sort((a, b) => b.performance.totalSales - a.performance.totalSales);

    // Summary stats
    const totalSales = staffPerformance.reduce((sum, s) => sum + s.performance.totalSales, 0);
    const totalTransactions = staffPerformance.reduce((sum, s) => sum + s.performance.transactionCount, 0);
    const overallAverage = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalStaff: staffMembers.length,
          activeStaff: activeStaffCount,
          maxStaffAllowed: maxStaff,
          staffUtilization: Math.round((staffMembers.length / maxStaff) * 100),
          totalSales,
          totalTransactions,
          averageTransaction: Math.round(overallAverage)
        },
        staffMembers: staffPerformance,
        timeRange: {
          value: timeRange,
          display: timeRange.charAt(0).toUpperCase() + timeRange.slice(1),
          start: startDate,
          end: now
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        timezone: 'Africa/Nairobi'
      }
    });

  } catch (error) {
    console.error('Staff overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff overview',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'STAFF_OVERVIEW_ERROR'
    });
  }
};

// PATCH /staff/:staffId/status
export const updateStaffStatus = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { status } = req.body; // active, suspended, or frozen

    const staff = await User.findOneAndUpdate(
      { _id: staffId, tenantId: req.user.tenantId },
      { status },
      { new: true }
    ).select('-password -refreshTokens');

    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });

    res.json({ success: true, message: `Staff account ${status}`, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

// DELETE /staff/:staffId
export const deleteStaff = async (req, res) => {
  try {
    const { staffId } = req.params;

    const staff = await User.findOneAndDelete({ _id: staffId, tenantId: req.user.tenantId });
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });

    res.json({ success: true, message: 'Staff account deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete staff', error: error.message });
  }
};
export const getAllStaffStatsWithTrends = async (req, res) => {
  try {
    const { timeRange = 'month' } = req.query;

    const startDate = new Date();
    switch (timeRange) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const staffList = await User.find({
      tenantId: req.user.tenantId,
      role: 'attendant'
    }).select('firstName lastName email phone status lastLogin permissions createdAt');

    // Aggregate performance and daily sales trends
    const statsAgg = await Sale.aggregate([
      {
        $match: {
          attendant: { $in: staffList.map(s => s._id) },
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: { attendant: '$attendant', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
          dailySales: { $sum: '$totalAmount' },
          dailyTransactions: { $sum: 1 },
          bestSale: { $max: '$totalAmount' }
        }
      },
      {
        $group: {
          _id: '$_id.attendant',
          totalSales: { $sum: '$dailySales' },
          totalTransactions: { $sum: '$dailyTransactions' },
          bestSale: { $max: '$bestSale' },
          salesTrend: { $push: { day: '$_id.day', dailySales: '$dailySales', dailyTransactions: '$dailyTransactions' } }
        }
      }
    ]);

    const result = staffList.map(staff => {
      const stats = statsAgg.find(s => s._id.toString() === staff._id.toString()) || {};
      return {
        _id: staff._id,
        name: `${staff.firstName} ${staff.lastName}`,
        email: staff.email,
        phone: staff.phone,
        status: staff.status,
        permissions: staff.permissions,
        lastLogin: staff.lastLogin,
        memberSince: staff.createdAt,
        performance: {
          totalSales: stats.totalSales || 0,
          totalTransactions: stats.totalTransactions || 0,
          averageTransaction: Math.round((stats.totalSales || 0) / (stats.totalTransactions || 1)),
          bestSale: stats.bestSale || 0
        },
        salesTrend: stats.salesTrend || []
      };
    });

    // Sort descending by total sales
    result.sort((a, b) => b.performance.totalSales - a.performance.totalSales);

    res.status(200).json({
      success: true,
      data: {
        staff: result,
        timeRange: {
          value: timeRange,
          start: startDate,
          end: new Date()
        }
      }
    });

  } catch (error) {
    console.error('All staff stats with trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff stats',
      error: error.message
    });
  }
};
 
/**
 * Get staff member details with performance stats
 * @route GET /api/pharmacy/staff/:staffId/details
 */
export const getStaffDetails = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { timeRange = 'month' } = req.query;

    const startDate = new Date();
    switch (timeRange) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const staff = await User.findOne({
      _id: staffId,
      tenantId: req.user.tenantId,
      role: 'attendant'
    }).select('-password -refreshTokens');

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Get performance metrics
    const performanceStats = await Sale.aggregate([
      {
        $match: {
          attendant: new mongoose.Types.ObjectId(staffId),
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          averageTransaction: { $avg: '$totalAmount' },
          bestSale: { $max: '$totalAmount' },
          lastSaleDate: { $max: '$createdAt' }
        }
      }
    ]);

    // Get sales trend by day
    const salesTrend = await Sale.aggregate([
      {
        $match: {
          attendant: new mongoose.Types.ObjectId(staffId),
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          dailySales: { $sum: '$totalAmount' },
          dailyTransactions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const stats = performanceStats[0] || {
      totalSales: 0,
      totalTransactions: 0,
      averageTransaction: 0,
      bestSale: 0,
      lastSaleDate: null
    };

    res.status(200).json({
      success: true,
      data: {
        staffInfo: {
          _id: staff._id,
          name: `${staff.firstName} ${staff.lastName}`,
          email: staff.email,
          phone: staff.phone,
          permissions: staff.permissions,
          status: staff.status,
          lastLogin: staff.lastLogin,
          memberSince: staff.createdAt
        },
        performance: {
          ...stats,
          averageTransaction: Math.round(stats.averageTransaction || 0)
        },
        salesTrend,
        timeRange: {
          value: timeRange,
          start: startDate,
          end: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Staff details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff details',
      error: error.message
    });
  }
};

/**
 * Get staff activity status (who's currently active)
 * @route GET /api/pharmacy/staff/activity-status
 */
export const getStaffActivityStatus = async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    const activeStaff = await User.find({
      tenantId: req.user.tenantId,
      role: 'attendant',
      status: 'active',
      lastLogin: { $gte: fifteenMinutesAgo }
    }).select('firstName lastName lastLogin');

    res.status(200).json({
      success: true,
      data: {
        activeStaffCount: activeStaff.length,
        activeStaff: activeStaff.map(staff => ({
          _id: staff._id,
          name: `${staff.firstName} ${staff.lastName}`,
          lastActive: staff.lastLogin,
          status: 'online'
        })),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Staff activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff activity',
      error: error.message
    });
  }
};