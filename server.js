import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import app from './src/app.js';
import cloudinary from './src/config/cloudinary.js'; // Import Cloudinary

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Cloudinary config check
console.log('🔍 Cloudinary Configuration Status:', {
  isConfigured: cloudinary.config().cloud_name !== undefined,
  cloudName: cloudinary.config().cloud_name,
  apiKeyConfigured: !!cloudinary.config().api_key,
  apiSecretConfigured: !!cloudinary.config().api_secret,
  usingUrlFormat: !!process.env.CLOUDINARY_URL
});

// Connect DB
connectDB();
  
// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});