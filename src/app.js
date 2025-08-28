// src/app.js
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import authRoutes from './routes/auth.js';
import applicationRoutes from './routes/public.js';
import superAdmin from './routes/superAdmin.js';
import pharmacyRoutes from './routes/pharmacy.js';
import inventoryRoutes from './routes/inventory.js'; // Add this import

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);
app.use('/api/auth', authRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/inventory', inventoryRoutes); // Add this line

// Add public applications routes under a different path:
app.use('/api/public/applications', applicationRoutes);
app.use('/api/applications/superadmin', superAdmin);

export default app;