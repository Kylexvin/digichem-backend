import Pharmacy from '../../models/Pharmacy.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../../config/cloudinary.js';

// Get current branding settings with pharmacy info
export const getBranding = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.user.tenantId);
    
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    res.json({
      success: true,
      data: {
        // Branding settings
        branding: pharmacy.branding,
        
        // Pharmacy information
        pharmacyInfo: {
          name: pharmacy.name,
          subdomain: pharmacy.subdomain,
          type: pharmacy.type,
          websiteUrl: pharmacy.websiteUrl,
          contact: pharmacy.contact,
          address: pharmacy.address,
          operatingHours: pharmacy.operatingHours
        },
        
        // Subscription info
        subscription: {
          plan: pharmacy.subscription.plan,
          status: pharmacy.subscription.status,
          nextBilling: pharmacy.subscription.nextBilling
        },
        
        // Features
        features: pharmacy.features
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching branding',
      error: error.message
    });
  }
};

// Update basic branding (colors, theme)
export const updateBranding = async (req, res) => {
  try {
    const { primaryColor, secondaryColor, theme } = req.body;
    
    const updateData = {};
    if (primaryColor) updateData['branding.primaryColor'] = primaryColor;
    if (secondaryColor) updateData['branding.secondaryColor'] = secondaryColor;
    if (theme) updateData['branding.theme'] = theme;

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.user.tenantId,
      { $set: updateData },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Branding updated successfully',
      data: pharmacy.branding
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating branding',
      error: error.message
    });
  }
};

// Upload logo or favicon
export const uploadBrandImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { imageType } = req.body; // 'logo' or 'favicon'
    
    if (!['logo', 'favicon'].includes(imageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type. Must be "logo" or "favicon"'
      });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: `pharmacy/${req.user.tenantId}/branding`,
      transformation: [
        { width: 500, height: 500, crop: 'limit' }, // For logos
        { quality: 'auto' }
      ]
    });

    // Update pharmacy with new image URL
    const updateField = `branding.${imageType}`;
    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.user.tenantId,
      { $set: { [updateField]: result.secure_url } },
      { new: true }
    );

    res.json({
      success: true,
      message: `${imageType} uploaded successfully`,
      url: result.secure_url,
      data: pharmacy.branding
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: error.message
    });
  }
};

// Remove logo or favicon
export const removeBrandImage = async (req, res) => {
  try {
    const { imageType } = req.body; // 'logo' or 'favicon'
    
    if (!['logo', 'favicon'].includes(imageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type'
      });
    }

    const pharmacy = await Pharmacy.findById(req.user.tenantId);
    const currentImageUrl = pharmacy.branding[imageType];
    
    // Remove from Cloudinary if exists
    if (currentImageUrl) {
      const publicId = currentImageUrl.split('/').pop().split('.')[0];
      await deleteFromCloudinary(publicId);
    }

    // Remove from database
    const updateField = `branding.${imageType}`;
    await Pharmacy.findByIdAndUpdate(
      req.user.tenantId,
      { $unset: { [updateField]: "" } }
    );

    res.json({
      success: true,
      message: `${imageType} removed successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing image',
      error: error.message
    });
  }
};