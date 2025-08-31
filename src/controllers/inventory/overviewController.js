import Product from '../../models/Product.js';
import InventoryLog from '../../models/InventoryLog.js';
import StockReconciliation from '../../models/StockReconciliation.js';

export const getInventoryOverview = async (req, res) => {
  try {
    const pharmacyId = req.user?.tenantId;
    if (!pharmacyId) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacy ID is required'
      });
    }

    // ===== Products =====
    const totalProducts = await Product.countDocuments({
      pharmacy: pharmacyId,
      status: 'active'
    });

    const lowStockProducts = await Product.getLowStockProducts(pharmacyId);
    const lowStockCount = lowStockProducts.length;

    const products = await Product.find({ pharmacy: pharmacyId });
    const totalStockValue = products.reduce((sum, p) => sum + (p.stockValue || 0), 0);

    const recentLogs = await InventoryLog.find({ pharmacy: pharmacyId })
      .populate('product', 'name')
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const pendingReconciliations = await StockReconciliation.countDocuments({
      pharmacy: pharmacyId,
      status: 'pending'
    });

    const reconciliationStats = await StockReconciliation.aggregate([
      { $match: { pharmacy: pharmacyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        products: {
          total: totalProducts,
          lowStock: lowStockCount,
          totalValue: totalStockValue
        },
        recentLogs,
        reconciliations: {
          pending: pendingReconciliations,
          stats: reconciliationStats
        }
      }
    });
  } catch (error) {
    console.error('Error in inventory overview:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching overview',
      error: error.message
    });
  }
};

