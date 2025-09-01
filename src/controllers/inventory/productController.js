// src/controllers/inventory/productController.js
import Product from '../../models/Product.js';
import InventoryLog from '../../models/InventoryLog.js';

// 1. POST /api/inventory/products - Add new product
export const createProduct = async (req, res) => {
  try {
    // Ensure pharmacy is always set to the user's tenant
    const productData = {
      ...req.body,
      pharmacy: req.user.tenantId,
      createdBy: req.user.id
    };

    const product = new Product(productData);
    await product.save();

    // Log inventory activity
    await InventoryLog.create({
      product: product._id,
      pharmacy: req.user.tenantId,
      action: 'create',
      performedBy: req.user.id,
      details: req.body
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

// 2. GET /api/inventory/products - List all products
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacy: req.user.tenantId };

    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: products,
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
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};

// 4. PUT /api/inventory/products/:id - Update product
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, pharmacy: req.user.tenantId });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // If stock update requested
    if (req.body.stock) {
      const { fullPacks = 0, looseUnits = 0 } = req.body.stock;
      await product.addStock(fullPacks, looseUnits);
    }

    // Update other fields (name, description, etc.)
    const updatableFields = ['name', 'description', 'category', 'pricing', 'status'];
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    product.lastModifiedBy = req.user.id;
    await product.save();

    // Log inventory activity
    await InventoryLog.create({
      product: product._id,
      pharmacy: req.user.tenantId,
      action: 'update',
      performedBy: req.user.id,
      details: req.body
    });

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};



// 3. GET /api/inventory/products/:id - Get single product
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      pharmacy: req.user.tenantId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};



// 5. DELETE /api/inventory/products/:id - Soft delete
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, pharmacy: req.user.tenantId },
      { status: 'inactive', lastModifiedBy: req.user.id },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await InventoryLog.create({
      product: product._id,
      pharmacy: req.user.tenantId,
      action: 'delete',
      performedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};