// src/routes/inventory.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct
} from '../controllers/inventory/productController.js';

import { getInventoryOverview } from '../controllers/inventory/overviewController.js';
import {
  getLowStockProducts,
  adjustStock,
  getStockHistory,
  getPendingReconciliations,    
  updateReconciliation,           
  getReconciliationStats,       
  adjustStockFromReconciliation 
} from '../controllers/inventory/stockController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Product management routes
router.post('/products', authorize(['pharmacy_owner', 'attendant']), createProduct);
router.get('/products', authorize(['pharmacy_owner', 'attendant']), getProducts);
router.get('/products/:id', authorize(['pharmacy_owner', 'attendant']), getProduct);
router.put('/products/:id', authorize(['pharmacy_owner']), updateProduct);
router.delete('/products/:id', authorize(['pharmacy_owner']), deleteProduct);

// Stock management routes
router.get('/low-stock', authorize(['pharmacy_owner']), getLowStockProducts);
router.post('/stock-adjustment', authorize(['pharmacy_owner']), adjustStock);
router.get('/stock-history', authorize(['pharmacy_owner']), getStockHistory);

// NEW: Stock Reconciliation Routes - Pharmacy owners only
router.get('/reconciliations/pending', 
  authorize(['pharmacy_owner']),
  getPendingReconciliations
);

router.get('/reconciliations/stats', 
  authorize(['pharmacy_owner']),
  getReconciliationStats
);

router.put('/reconciliations/:id', 
  authorize(['pharmacy_owner']),
  updateReconciliation
);

router.post('/reconciliations/:id/adjust', 
  authorize(['pharmacy_owner']),
  adjustStockFromReconciliation
);
// Overview route
router.get('/overview',
  authorize(['pharmacy_owner', 'attendant']),
  getInventoryOverview
);

export default router;