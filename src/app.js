import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import authRoutes from './routes/auth.js';
import applicationRoutes from './routes/public.js';
 
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);
// Import routes

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
export default app;
