// src/services/notificationService.js - FIXED
import nodemailer from 'nodemailer';

// Create email transporter (using Gmail for testing)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// SMS function (mock for now - can integrate with African providers like Africa's Talking)
export const sendSMS = async (phone, message) => {
  console.log(`[SMS] To: ${phone}, Message: ${message}`);
  // TODO: Integrate with SMS provider like Africa's Talking
  return true;
};

// Email function
export const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    if (process.env.NODE_ENV === 'production') {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent to: ${to}`);
    } else {
      // Development mode - just log to console
      console.log('📧 [EMAIL SIMULATION]');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${html}`);
      console.log('-----------------------------------');
    }
    
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
};

// Welcome email for new staff
export const sendWelcomeEmail = async (email, firstName, tempPassword, pharmacyName) => {
  const subject = `Welcome to ${pharmacyName} - Your Staff Account`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ${pharmacyName}!</h2>
      <p>Hello ${firstName},</p>
      <p>Your staff account has been created successfully.</p>
      <p><strong>Login Details:</strong></p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Temporary Password:</strong> ${tempPassword}</li>
        <li><strong>Login URL:</strong> ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login</li>
      </ul>
      <p>Please change your password after first login.</p>
      <br>
      <p>Best regards,<br>${pharmacyName} Management</p>
    </div>
  `;

  return await sendEmail(email, subject, html);
};

// Low stock alert email
export const sendLowStockAlert = async (ownerEmail, productName, currentStock, minStock) => {
  const subject = `Low Stock Alert: ${productName}`;
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h3>Low Stock Alert</h3>
      <p>Product: <strong>${productName}</strong></p>
      <p>Current Stock: <strong>${currentStock} units</strong></p>
      <p>Minimum Required: <strong>${minStock} units</strong></p>
      <p>Please restock this product soon.</p>
    </div>
  `;

  return await sendEmail(ownerEmail, subject, html);
};

// Password reset email
export const sendPasswordReset = async (email, firstName, resetToken) => {
  const subject = 'Password Reset Request';
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h3>Password Reset</h3>
      <p>Hello ${firstName},</p>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}">Reset Password</a></p>
      <p>This link will expire in 1 hour.</p>
    </div>
  `;

  return await sendEmail(email, subject, html);
};