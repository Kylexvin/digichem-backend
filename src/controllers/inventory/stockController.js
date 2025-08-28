// src/controllers/inventory/stockController.js
import Product from '../../models/Product.js';
import InventoryLog from '../../models/InventoryLog.js';

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