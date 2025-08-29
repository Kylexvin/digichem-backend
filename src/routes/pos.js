import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { processSale, getSales, checkSalesPermissions } from '../controllers/pos/saleController.js';

const router = express.Router();

// Apply authentication to all POS routes
router.use(authenticate);

// POS Routes - FIXED ORDER
router.post('/sales', 
  checkSalesPermissions, 
  authorize(['pharmacy_owner', 'attendant']), 
  processSale
);

router.get('/sales', 
  authorize(['pharmacy_owner', 'attendant']),
  getSales
);

export default router;