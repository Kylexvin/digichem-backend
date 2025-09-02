import Sale from '../../models/Sale.js';
import Product from '../../models/Product.js';
import InventoryLog from '../../models/InventoryLog.js';
import StockReconciliation from '../../models/StockReconciliation.js';
import StaffActivity from '../../models/StaffActivity.js';

import mongoose from 'mongoose';

const generateReceiptNumber = () => {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const randomPart = Math.random().toString(36).substr(2, 4).toUpperCase();
  
  return `RX-${datePart}-${timePart}-${randomPart}`;
};
// Helper: Update product stock based on product type
async function updateProductStock(product, quantity, session) {
  const productType = product.unitType;
  
  // Handle different product types
  switch(productType) {
    // CAN be subdivided (tablets, capsules, powder)
    case 'Tablets':
    case 'Capsules':
    case 'Grams':
      await handleSubdividableProduct(product, quantity, session);
      break;
    
    // CANNOT be subdivided (bottles, tubes, units)  
    case 'Bottles':
    case 'Tubes': 
    case 'Units':
    case 'Millilitres':
    case 'Packs':
      await handleWholeUnitProduct(product, quantity, session);
      break;
    
    default:
      await handleWholeUnitProduct(product, quantity, session);
  }
}

// Handle products that can be subdivided (tablets, capsules, etc.)
async function handleSubdividableProduct(product, quantity, session) {
  let remainingQuantity = quantity;
  
  // First use loose units
  const unitsFromLoose = Math.min(remainingQuantity, product.stock.looseUnits);
  product.stock.looseUnits -= unitsFromLoose;
  remainingQuantity -= unitsFromLoose;
  
  // If still need units, break packs
  if (remainingQuantity > 0) {
    const packsToBreak = Math.ceil(remainingQuantity / product.pricing.unitsPerPack);
    
    if (packsToBreak > product.stock.fullPacks) {
      throw new Error(`Not enough ${product.unitType.toLowerCase()} available`);
    }
    
    product.stock.fullPacks -= packsToBreak;
    const unitsFromPacks = packsToBreak * product.pricing.unitsPerPack;
    product.stock.looseUnits += (unitsFromPacks - remainingQuantity);
  }
  
  await product.save({ session });
}


// Handle products that cannot be subdivided (bottles, inhalers, etc.)
async function handleWholeUnitProduct(product, quantity, session) {
  // For non-subdividable products, we can only sell whole units
  const totalUnitsNeeded = quantity;
  
  if (totalUnitsNeeded > product.stock.totalUnits) {
    throw new Error(`Not enough ${product.unitType.toLowerCase()} available. Only ${product.stock.totalUnits} left`);
  }
  
  // For whole units, we can use both full packs and loose units
  let remainingQuantity = quantity;
  
  // First use loose units
  const unitsFromLoose = Math.min(remainingQuantity, product.stock.looseUnits);
  product.stock.looseUnits -= unitsFromLoose;
  remainingQuantity -= unitsFromLoose;
  
  // Then use full packs (each pack = 1 unit for non-subdividable)
  if (remainingQuantity > 0) {
    product.stock.fullPacks -= remainingQuantity;
  }
  
  await product.save({ session });
}

// Middleware to check sales permissions
export const checkSalesPermissions = (req, res, next) => {
  if (req.body.ignoreStock === true) {
    // Allow pharmacy owners always
    if (req.user.role === 'pharmacy_owner') {
      return next();
    }
    
    // Allow attendants with overrideStock permission
    if (req.user.role === 'attendant') {
      // Check if attendant has overrideStock permission
      if (req.user.permissions && req.user.permissions.overrideStock === true) {
        return next();
      }
    }
    
    // Deny everyone else
    return res.status(403).json({
      success: false,
      message: 'Only pharmacy owners or authorized attendants can override stock checks'
    });
  }
  next();
};

async function createReconciliationRecords(sale, stockWarnings, session) {
  try {
    // Only process warnings with actual deficits
    const actualShortages = stockWarnings.filter(warning => warning.deficit > 0);
    
    if (actualShortages.length === 0) {
      return; // No need to create reconciliation records
    }

    for (const warning of actualShortages) {
      const product = await Product.findOne({ 
        name: warning.product, 
        pharmacy: sale.pharmacy 
      }).session(session);
      
      if (product && warning.deficit > 0) {
        const reconciliation = new StockReconciliation({
          saleId: sale._id,
          pharmacy: sale.pharmacy,
          attendant: sale.attendant,
          product: product._id,
          productName: warning.product,
          quantitySold: warning.requested,
          availableStock: warning.available,
          deficit: warning.deficit,
          createdBy: sale.createdBy
        });
        await reconciliation.save({ session });
      }
    }
  } catch (error) {
    console.error('Error creating reconciliation records:', error);
    // Don't fail the sale because of reconciliation issues
  }
}

// Main sale processing function
export const processSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, paymentMethod, amountPaid, ignoreStock = false } = req.body;
    
    let totalAmount = 0;
    const saleItems = [];
    const stockWarnings = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` });
      }

      if (product.status !== 'active') {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Product ${product.name} is not active` });
      }

      const itemTotal = item.quantity * product.pricing.pricePerUnit;
      totalAmount += itemTotal;

      saleItems.push({
        product: product._id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.pricing.pricePerUnit,
        total: itemTotal,
        unitType: product.unitType
      });

      // Stock check
      if (!ignoreStock) {
        if (item.quantity > product.stock.totalUnits) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stock.totalUnits}, Requested: ${item.quantity}`,
            suggestion: 'Set ignoreStock=true to proceed anyway'
          });
        }
        await updateProductStock(product, item.quantity, session);
      } else {
        const hasStockShortage = item.quantity > product.stock.totalUnits;
        if (hasStockShortage) {
          stockWarnings.push({
            product: product.name,
            requested: item.quantity,
            available: product.stock.totalUnits,
            deficit: item.quantity - product.stock.totalUnits
          });
        } else {
          await updateProductStock(product, item.quantity, session);
        }
      }
    }

    const changeDue = Math.max(0, amountPaid - totalAmount);
    if (amountPaid < totalAmount) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Insufficient payment. Total: ${totalAmount}, Paid: ${amountPaid}` });
    }

    const receiptNumber = generateReceiptNumber();

    const sale = new Sale({
      pharmacy: req.user.tenantId,
      attendant: req.user.id,
      items: saleItems,
      subtotal: totalAmount,
      totalAmount,
      amountPaid,
      changeDue,
      paymentMethod: paymentMethod || 'cash',
      status: 'completed',
      createdBy: req.user.id,
      receiptNumber,
      metadata: {
        ignoreStock,
        stockWarnings
      }
    });

    await sale.save({ session });

    if (ignoreStock && stockWarnings.length > 0) {
      await createReconciliationRecords(sale, stockWarnings, session);
    }

    // Inventory logs
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      await InventoryLog.create([{
        product: product._id,
        pharmacy: req.user.tenantId,
        action: 'sale',
        performedBy: req.user.id,
        details: {
          quantity: item.quantity,
          saleId: sale._id,
          productName: product.name,
          unitPrice: product.pricing.pricePerUnit,
          totalAmount: item.quantity * product.pricing.pricePerUnit,
          receiptNumber: sale.receiptNumber
        }
      }], { session });
    }

    // Staff activity log (safe, won’t break main flow)
    try {
  await StaffActivity.log({
    tenantId: req.user.tenantId,
    staff: req.user.id,
    action: 'sale_completed', // must match enum
    details: {
      saleId: sale._id,
      items: saleItems,
      totalAmount,
      amountPaid,
      changeDue,
      paymentMethod
    },
    deviceInfo: {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      location: req.get('CF-IPCountry') || 'Unknown'
    }
  });
} catch (err) {
  console.warn('Failed to log staff activity:', err.message);
}

    await session.commitTransaction();
    session.endSession();

    const response = {
      success: true,
      message: 'Sale processed successfully',
      data: {
        sale: {
          _id: sale._id,
          receiptNumber: sale.receiptNumber,
          items: sale.items,
          subtotal: sale.subtotal,
          totalAmount: sale.totalAmount,
          amountPaid: sale.amountPaid,
          changeDue: sale.changeDue,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt
        },
        changeDue
      }
    };

    if (stockWarnings.length > 0) {
      response.warnings = {
        message: 'Stock levels exceeded. Please reconcile inventory.',
        items: stockWarnings
      };
    }

    res.json(response);

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: 'Failed to process sale', error: error.message });
  }
};




// Get sales list
export const getSales = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const filter = { 
      pharmacy: req.user.tenantId, 
      status: 'completed' 
    };
    
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const sales = await Sale.find(filter)
      .populate('attendant', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Sale.countDocuments(filter);

    res.json({
      success: true,
      data: sales,
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
      message: 'Failed to fetch sales',
      error: error.message
    });
  }
};

