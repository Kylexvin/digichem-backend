// src/controllers/pharmacy/dashboardController.js
import mongoose from 'mongoose';
import Sale from '../../models/Sale.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';
import Pharmacy from '../../models/Pharmacy.js';

// Update the getDashboardOverview function in dashboardController.js
const getDateRangeFilter = (timeRange) => {
  const now = new Date();
  const start = new Date();
  
  switch (timeRange) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    case 'week':
      start.setDate(start.getDate() - 7);
      return { start, end: now };
    case 'month':
      start.setMonth(start.getMonth() - 1);
      return { start, end: now };
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      return { start, end: now };
    default:
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
  }
};

// Helper function for consistent low stock calculation
const calculateLowStockCount = (products) => {
  return products.filter(product => {
    const unitsPerPack = product.pricing?.unitsPerPack || 1;
    const totalUnits = (product.stock?.fullPacks || 0) * unitsPerPack + 
                      (product.stock?.looseUnits || 0);
    const minStock = product.stock?.minStockLevel || 0;
    return totalUnits <= minStock && totalUnits > 0;
  }).length;
};

// Helper function for consistent out of stock calculation
const calculateOutOfStockCount = (products) => {
  return products.filter(product => {
    const unitsPerPack = product.pricing?.unitsPerPack || 1;
    const totalUnits = (product.stock?.fullPacks || 0) * unitsPerPack + 
                      (product.stock?.looseUnits || 0);
    return totalUnits === 0;
  }).length;
};

// Helper function for consistent stock value calculation
const calculateTotalStockValue = (products) => {
  return products.reduce((total, product) => {
    if (product.pricing?.costPerPack && product.pricing?.unitsPerPack) {
      const costPerUnit = product.pricing.costPerPack / product.pricing.unitsPerPack;
      const totalUnits = (product.stock?.fullPacks || 0) * product.pricing.unitsPerPack + 
                        (product.stock?.looseUnits || 0);
      return total + (totalUnits * costPerUnit);
    }
    return total;
  }, 0);
};

export const getDashboardOverview = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    const { timeRange = 'today' } = req.query;
    
    // Validate timeRange parameter
    const validTimeRanges = ['today', 'yesterday', 'week', 'month', 'year'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timeRange parameter. Use: today, yesterday, week, month, year'
      });
    }
    
    const dateFilter = getDateRangeFilter(timeRange);
    
    // Get sales data
    const salesData = await Sale.aggregate([
      { 
        $match: { 
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          averageTransaction: { $avg: '$totalAmount' }
        }
      }
    ]);
    
    // Get all products for consistent calculations
    const products = await Product.find({
      pharmacy: pharmacyId,
      status: 'active'
    });
    
    // Calculate inventory stats using helper functions
    const totalStockValue = calculateTotalStockValue(products);
    const lowStockCount = calculateLowStockCount(products);
    const outOfStockCount = calculateOutOfStockCount(products);
    
    // Get staff count
    const staffCount = await User.countDocuments({
      tenantId: new mongoose.Types.ObjectId(pharmacyId),
      role: 'attendant',
      status: 'active'
    });
    
    // Get recent sales (last 5)
    const recentSales = await Sale.find({
      pharmacy: pharmacyId,
      status: 'completed'
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('attendant', 'firstName lastName')
    .select('receiptNumber totalAmount createdAt');
    
    // Get out of stock products for display
    const outOfStockProducts = await Product.find({
      pharmacy: pharmacyId,
      status: 'active'
    })
    .select('name category stock.fullPacks stock.looseUnits stock.minStockLevel pricing.unitsPerPack')
    .lean();
    
    const formattedOutOfStockProducts = outOfStockProducts
      .filter(product => {
        const unitsPerPack = product.pricing?.unitsPerPack || 1;
        const totalUnits = (product.stock?.fullPacks || 0) * unitsPerPack + 
                          (product.stock?.looseUnits || 0);
        return totalUnits === 0;
      })
      .map(product => ({
        _id: product._id,
        name: product.name,
        category: product.category,
        stock: {
          fullPacks: product.stock?.fullPacks || 0,
          looseUnits: product.stock?.looseUnits || 0,
          minStockLevel: product.stock?.minStockLevel || 0
        }
      }))
      .slice(0, 5);
    
    // Format response
    const result = {
      sales: {
        total: salesData[0]?.totalSales || 0,
        transactions: salesData[0]?.totalTransactions || 0,
        average: salesData[0]?.averageTransaction || 0
      },
      inventory: {
        totalProducts: products.length,
        totalValue: Math.round(totalStockValue * 100) / 100, // Round to 2 decimal places
        lowStockCount,
        outOfStockCount
      },
      staff: {
        count: staffCount
      },
      recentSales,
      outOfStockProducts: formattedOutOfStockProducts,
      timeRange: {
        value: timeRange,
        display: timeRange.charAt(0).toUpperCase() + timeRange.slice(1),
        start: dateFilter.start,
        end: dateFilter.end
      }
    };
    
    res.status(200).json({
      success: true,
      data: result,
      metadata: {
        generatedAt: new Date().toISOString(),
        timezone: 'UTC'
      }
    });
    
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'DASHBOARD_FETCH_ERROR'
    });
  }
};

export const getSalesAnalytics = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    const { period = 'week', groupBy = 'day' } = req.query;
    
    // Validate parameters
    const validPeriods = ['today', 'yesterday', 'week', 'month', 'year'];
    const validGroupBy = ['day', 'month'];
    
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period parameter. Use: today, yesterday, week, month, year'
      });
    }
    
    if (!validGroupBy.includes(groupBy)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid groupBy parameter. Use: day, month'
      });
    }
    
    const dateFilter = getDateRangeFilter(period);
    
    // Sales trend data
    const salesTrend = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
              date: '$createdAt'
            }
          },
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          averageSale: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Top selling products
    const topProducts = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' },
          averagePrice: { $avg: '$items.unitPrice' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);
    
    // Payment method distribution
    const paymentMethods = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
          percentage: { 
            $avg: { 
              $cond: [
                { $ne: ['$totalAmount', 0] },
                100,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          totalAmount: 1,
          count: 1,
          percentage: {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      '$totalAmount',
                      { $sum: '$totalAmount' }
                    ]
                  },
                  100
                ]
              },
              2
            ]
          }
        }
      }
    ]);
    
    // Calculate overall totals
    const overallStats = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          averageTransaction: { $avg: '$totalAmount' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        period: {
          value: period,
          display: period.charAt(0).toUpperCase() + period.slice(1),
          start: dateFilter.start,
          end: dateFilter.end
        },
        groupBy,
        overall: overallStats[0] || {
          totalRevenue: 0,
          totalTransactions: 0,
          averageTransaction: 0
        },
        salesTrend,
        topProducts,
        paymentMethods
      },
      metadata: {
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales analytics',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'SALES_ANALYTICS_ERROR'
    });
  }
};

export const getQuickStats = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    const { compareWith = 'yesterday' } = req.query;
    
    // Validate compareWith parameter
    const validCompareWith = ['yesterday', 'last_week', 'last_month'];
    if (!validCompareWith.includes(compareWith)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid compareWith parameter. Use: yesterday, last_week, last_month'
      });
    }
    
    const currentDateFilter = getDateRangeFilter('today');
    const compareDateFilter = getDateRangeFilter(compareWith === 'last_week' ? 'week' : 
                                               compareWith === 'last_month' ? 'month' : 'yesterday');
    
    // Current period stats
    const currentStats = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: currentDateFilter.start, $lte: currentDateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    // Comparison period stats
    const compareStats = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: compareDateFilter.start, $lte: compareDateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    // Get all products for consistent low stock calculation
    const products = await Product.find({
      pharmacy: pharmacyId,
      status: 'active'
    });
    
    const lowStockCount = calculateLowStockCount(products);
    const outOfStockCount = calculateOutOfStockCount(products);
    
    const current = currentStats[0] || { totalSales: 0, transactionCount: 0 };
    const compare = compareStats[0] || { totalSales: 0, transactionCount: 0 };
    
    // Improved percentage change calculation with better edge case handling
    const calculateChange = (currentVal, compareVal, type) => {
      if (currentVal === 0 && compareVal === 0) {
        return { value: 0, context: 'no_change' };
      }
      if (currentVal === 0) {
        return { value: -100, context: 'no_current_activity' };
      }
      if (compareVal === 0) {
        return { value: 100, context: 'no_previous_activity' };
      }
      
      const change = ((currentVal - compareVal) / compareVal) * 100;
      return { 
        value: Math.round(change), 
        context: change >= 0 ? 'increase' : 'decrease' 
      };
    };
    
    const salesChange = calculateChange(current.totalSales, compare.totalSales, 'sales');
    const transactionChange = calculateChange(current.transactionCount, compare.transactionCount, 'transactions');
    
    res.status(200).json({
      success: true,
      data: {
        todaySales: current.totalSales,
        todayTransactions: current.transactionCount,
        salesChange: salesChange.value,
        salesContext: salesChange.context,
        transactionChange: transactionChange.value,
        transactionContext: transactionChange.context,
        lowStockCount,
        outOfStockCount,
        comparisonPeriod: compareWith,
        comparisonData: {
          periodSales: compare.totalSales,
          periodTransactions: compare.transactionCount,
          periodStart: compareDateFilter.start,
          periodEnd: compareDateFilter.end
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        currentPeriod: {
          start: currentDateFilter.start,
          end: currentDateFilter.end
        }
      }
    });
    
  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick stats',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'QUICK_STATS_ERROR'
    });
  }
};

/**
 * Get inventory overview
 * @route GET /api/pharmacy/dashboard/inventory-overview
 * @access Private (Pharmacy users only)
 */
export const getInventoryOverview = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    
    const inventoryStats = await Product.aggregate([
      { $match: { pharmacy: new mongoose.Types.ObjectId(pharmacyId), status: 'active' } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStockValue: { $sum: '$stockValue' },
          lowStockCount: {
            $sum: {
              $cond: [{ $lte: ['$stock.totalUnits', '$stock.minStockLevel'] }, 1, 0]
            }
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ['$stock.totalUnits', 0] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    // Category distribution
    const categoryDistribution = await Product.aggregate([
      { $match: { pharmacy: new mongoose.Types.ObjectId(pharmacyId), status: 'active' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: '$stockValue' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Expiring soon (within 30 days)
    const expiringSoon = await Product.find({
      pharmacy: pharmacyId,
      status: 'active',
      expiryDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    })
    .select('name expiryDate batchNumber stock.totalUnits')
    .sort({ expiryDate: 1 })
    .limit(10);
    
    res.status(200).json({
      success: true,
      data: {
        summary: inventoryStats[0] || {
          totalProducts: 0,
          totalStockValue: 0,
          lowStockCount: 0,
          outOfStockCount: 0
        },
        categoryDistribution,
        expiringSoon
      }
    });
    
  } catch (error) {
    console.error('Inventory overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory overview',
      error: error.message
    });
  }
};

/**
 * Get staff performance metrics
 * @route GET /api/pharmacy/dashboard/staff-performance
 * @access Private (Pharmacy owner only)
 */
export const getStaffPerformance = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    const { timeRange = 'month' } = req.query;
    
    const dateFilter = getDateRangeFilter(timeRange);
    
    // Staff performance metrics
    const staffPerformance = await Sale.aggregate([
      {
        $match: {
          pharmacy: new mongoose.Types.ObjectId(pharmacyId),
          createdAt: { $gte: dateFilter.start, $lte: dateFilter.end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$attendant',
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
          averageTransaction: { $avg: '$totalAmount' }
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
      {
        $unwind: '$attendantInfo'
      },
      {
        $project: {
          attendantName: {
            $concat: ['$attendantInfo.firstName', ' ', '$attendantInfo.lastName']
          },
          totalSales: 1,
          transactionCount: 1,
          averageTransaction: 1
        }
      },
      { $sort: { totalSales: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        staffPerformance,
        timeRange
      }
    });
    
  } catch (error) {
    console.error('Staff performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff performance data',
      error: error.message
    });
  }
};

/**
 * Get pharmacy subscription status and limits
 * @route GET /api/pharmacy/dashboard/subscription-status
 * @access Private (Pharmacy users only)
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const pharmacyId = req.user.tenantId;
    
    const pharmacy = await Pharmacy.findById(pharmacyId)
      .select('subscription features stats settings');
    
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }
    
    // Get current usage stats
    const currentStaff = await User.countDocuments({
      tenantId: pharmacyId,
      role: 'attendant',
      status: 'active'
    });
    
    const currentProducts = await Product.countDocuments({
      pharmacy: pharmacyId,
      status: 'active'
    });
    
    res.status(200).json({
      success: true,
      data: {
        subscription: pharmacy.subscription,
        features: pharmacy.features,
        usage: {
          staff: currentStaff,
          products: currentProducts,
          staffLimit: pharmacy.features.maxStaff,
          productsLimit: pharmacy.features.maxProducts
        },
        stats: pharmacy.stats,
        settings: pharmacy.settings
      }
    });
    
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription status',
      error: error.message
    });
  }
};

