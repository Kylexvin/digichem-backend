import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import authRoutes from './routes/auth.js';
import applicationRoutes from './routes/public.js';
import superAdmin from './routes/superAdmin.js';
import pharmacyRoutes from './routes/pharmacy.js';
import inventoryRoutes from './routes/inventory.js';
import staffRoutes from './routes/staff.js'; 
import posRoutes from './routes/pos.js';
import dashboard from './routes/dashboard.js';

const app = express(); 

// Fix CORS configuration 
app.use(cors({
  origin: 'http://localhost:3000', // Your React app URL
  credentials: true, // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})); 

app.use(express.json());

// Routes 
app.use('/api', routes);
app.use('/api/auth', authRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api', staffRoutes); 
app.use('/api/pos', posRoutes);
app.use('/api/public/applications', applicationRoutes);
app.use('/api/applications/superadmin', superAdmin);
app.use('/api/dashboard', dashboard);

export default app;