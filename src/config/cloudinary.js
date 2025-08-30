import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import stream from 'stream';

// Load environment variables
dotenv.config();

// Check if CLOUDINARY_URL is present
if (!process.env.CLOUDINARY_URL) {
  console.error('❌ Error: Missing CLOUDINARY_URL environment variable');
  console.error('Please set CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME in your .env file');
  process.exit(1);
}

console.log('✅ CLOUDINARY_URL found in environment');

// Manually parse the CLOUDINARY_URL
const cloudinaryUrl = process.env.CLOUDINARY_URL;
console.log('🔗 Cloudinary URL:', cloudinaryUrl.replace(/:[^:@]*@/, ':****@')); // Mask API secret

// Parse the URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
const urlMatch = cloudinaryUrl.match(/cloudinary:\/\/([^:]+):([^@]+)@([^\/]+)/);

if (!urlMatch) {
  console.error('❌ Invalid CLOUDINARY_URL format');
  console.error('Expected format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME');
  process.exit(1);
}

const [, api_key, api_secret, cloud_name] = urlMatch;

// Configure Cloudinary manually
cloudinary.config({
  cloud_name,
  api_key,
  api_secret
});

console.log('✅ Cloudinary configured with:');
console.log('   Cloud Name:', cloud_name);
console.log('   API Key:', api_key);
console.log('   API Secret:', '****' + api_secret.slice(-4)); // Mask most of the secret

// Test connection
cloudinary.api.ping()
  .then(() => console.log('✅ Cloudinary connected successfully'))
  .catch(error => {
    console.error('❌ Cloudinary connection failed:', error.message);
    console.error('Please check your CLOUDINARY_URL credentials');
    process.exit(1);
  });

// Upload buffer to Cloudinary
export const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'pharmacy/branding',
        ...options
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);
    bufferStream.pipe(uploadStream);
  });
};

// Delete from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Error deleting from Cloudinary: ${error.message}`);
  }
};

// Extract public ID from URL
export const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  try {
    const matches = url.match(/upload\/(?:v\d+\/)?(.+?)\.(?:jpg|png|jpeg|gif|webp)/);
    return matches ? matches[1] : null;
  } catch (error) {
    return null;
  }
};

export default cloudinary;