// src/controllers/inventory/stockController.js
import Product from '../../models/Product.js';
import InventoryLog from '../../models/InventoryLog.js';
import StockReconciliation from '../../models/StockReconciliation.js'; 



// GET /api/inventory/reconciliations/pending - Get pending stock reconciliations
export const getPendingReconciliations = async (req, res) => {
  try {
    const reconciliations = await StockReconciliation.find({
      pharmacy: req.user.tenantId,
      status: 'pending'
    })
    .populate('saleId', 'receiptNumber createdAt')
    .populate('attendant', 'firstName lastName')
    .populate('product', 'name sku')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: reconciliations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending reconciliations',
      error: error.message
    });
  }
};

// PUT /api/inventory/reconciliations/:id - Update reconciliation status
export const updateReconciliation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, action } = req.body;

    const reconciliation = await StockReconciliation.findOneAndUpdate(
      {
        _id: id,
        pharmacy: req.user.tenantId
      },
      {
        status,
        resolutionNotes,
        action,
        resolvedBy: req.user.id,
        resolvedAt: status === 'resolved' || status === 'adjusted' ? new Date() : undefined
      },
      { new: true }
    )
    .populate('saleId', 'receiptNumber')
    .populate('product', 'name')
    .populate('resolvedBy', 'firstName lastName');

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation record not found'
      });
    }

    res.json({
      success: true,
      message: 'Reconciliation updated successfully',
      data: reconciliation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update reconciliation',
      error: error.message
    });
  }
};

// GET /api/inventory/reconciliations/stats - Get reconciliation statistics
export const getReconciliationStats = async (req, res) => {
  try {
    const stats = await StockReconciliation.aggregate([
      {
        $match: {
          pharmacy: req.user.tenantId
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalDeficit: { $sum: '$deficit' }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reconciliation statistics',
      error: error.message
    });
  }
};

// POST /api/inventory/reconciliations/:id/adjust - Adjust stock from reconciliation
export const adjustStockFromReconciliation = async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustmentQuantity, notes } = req.body;

    const reconciliation = await StockReconciliation.findOne({
      _id: id,
      pharmacy: req.user.tenantId,
      status: 'pending'
    }).populate('product');

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: 'Pending reconciliation record not found'
      });
    }

    // Adjust the stock
    const product = await Product.findById(reconciliation.product._id);
    await product.addStock(0, adjustmentQuantity); // Add individual units

    await product.save();

    // Update reconciliation status
    reconciliation.status = 'adjusted';
    reconciliation.resolvedBy = req.user.id;
    reconciliation.resolvedAt = new Date();
    reconciliation.resolutionNotes = notes || `Stock adjusted by ${adjustmentQuantity} units`;
    reconciliation.action = 'stock_adjusted';
    
    await reconciliation.save();

    // Log the stock adjustment
    await InventoryLog.create({
      product: reconciliation.product._id,
      pharmacy: req.user.tenantId,
      action: 'stock_adjust',
      performedBy: req.user.id,
      details: {
        adjustmentType: 'add_units',
        quantity: adjustmentQuantity,
        reason: 'reconciliation',
        notes: `Stock reconciliation for sale ${reconciliation.saleId}: ${notes}`,
        reconciliationId: reconciliation._id
      }
    });

    res.json({
      success: true,
      message: 'Stock adjusted and reconciliation completed',
      data: {
        reconciliation,
        product: {
          id: product._id,
          name: product.name,
          newStock: product.stock
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to adjust stock from reconciliation',
      error: error.message
    });
  }
};
// GET /api/inventory/low-stock - Get low stock alerts
export const getLowStockProducts = async (req, res) => {
  try {
    const lowStockProducts = await Product.find({
      pharmacy: req.user.tenantId,
      status: 'active',
      $expr: { $lte: ['$stock.totalUnits', '$stock.minStockLevel'] }
    }).select('name category pricing stock sku unitType');

    // Format the response with actionable data
    const formattedProducts = lowStockProducts.map(product => ({
      id: product._id,
      name: product.name,
      category: product.category,
      currentStock: product.stock.totalUnits,
      minStockLevel: product.stock.minStockLevel,
      needed: Math.max(0, product.stock.minStockLevel - product.stock.totalUnits),
      unitType: product.unitType,
      sku: product.sku,
      restockUrgency: product.stock.totalUnits === 0 ? 'critical' : 
               product.stock.totalUnits <= (product.stock.minStockLevel * 0.3) ? 'high' : 
               product.stock.totalUnits <= product.stock.minStockLevel ? 'medium' : 'none'
    }));

    res.json({
      success: true,
      data: formattedProducts,
      summary: {
        totalLowStock: lowStockProducts.length,
        critical: formattedProducts.filter(p => p.restockUrgency === 'critical').length,
        high: formattedProducts.filter(p => p.restockUrgency === 'high').length,
        medium: formattedProducts.filter(p => p.restockUrgency === 'medium').length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products',
      error: error.message
    });
  }
};

// POST /api/inventory/stock-adjustment - Adjust stock levels
export const adjustStock = async (req, res) => {
  try {
    const { productId, adjustmentType, quantity, reason, notes } = req.body;

    const product = await Product.findOne({
      _id: productId,
      pharmacy: req.user.tenantId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const previousStock = {
      fullPacks: product.stock.fullPacks,
      looseUnits: product.stock.looseUnits,
      totalUnits: product.stock.totalUnits
    };

    // Apply stock adjustment
    if (adjustmentType === 'add') {
      await product.addStock(quantity, 0); // Add full packs
    } else if (adjustmentType === 'add_units') {
      await product.addStock(0, quantity); // Add individual units
    } else if (adjustmentType === 'remove') {
      // For removal, we need to be more careful
      const totalToRemove = quantity * product.pricing.unitsPerPack;
      if (totalToRemove > product.stock.totalUnits) {
        return res.status(400).json({
          success: false,
          message: `Cannot remove ${quantity} packs. Only ${product.stock.fullPacks} packs available.`
        });
      }
      product.stock.fullPacks -= quantity;
    } else if (adjustmentType === 'set') {
      // Set specific stock level
      const totalUnits = quantity * product.pricing.unitsPerPack;
      product.stock.fullPacks = quantity;
      product.stock.looseUnits = 0;
    }

    await product.save();

    // Log the stock adjustment
    await InventoryLog.create({
      product: productId,
      pharmacy: req.user.tenantId,
      action: 'stock_adjust',
      performedBy: req.user.id,
      details: {
        adjustmentType,
        quantity,
        reason,
        notes,
        previousStock,
        newStock: {
          fullPacks: product.stock.fullPacks,
          looseUnits: product.stock.looseUnits,
          totalUnits: product.stock.totalUnits
        }
      }
    });

    res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: {
        product: {
          id: product._id,
          name: product.name,
          stock: product.stock
        },
        adjustment: {
          type: adjustmentType,
          quantity,
          reason
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to adjust stock',
      error: error.message
    });
  }
};

// GET /api/inventory/stock-history - Stock movement history
export const getStockHistory = async (req, res) => {
  try {
    const { productId, page = 1, limit = 20, action } = req.query;
    const skip = (page - 1) * limit;

    const filter = { 
      pharmacy: req.user.tenantId,
      ...(productId && { product: productId }),
      ...(action && { action })
    };

    const history = await InventoryLog.find(filter)
      .populate('product', 'name sku category')
      .populate('performedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await InventoryLog.countDocuments(filter);

    res.json({
      success: true,
      data: history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock history',
      error: error.message
    });
  }
};