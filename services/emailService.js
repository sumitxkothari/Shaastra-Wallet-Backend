const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.mailersend.net",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an OTP email.
 * @param {string} to
 * @param {string} otp 
 * @param {string} type
 */
const sendOtpEmail = async (to, otp, type = 'register') => {
  let subject = 'Shaastra Wallet Verification';
  let bodyText = `Your OTP is: ${otp}`;
  
  switch (type) {
    case 'reset':
      subject = 'Reset Your Password - Shaastra Wallet';
      bodyText = `You requested a password reset. Your OTP is: <b>${otp}</b>`;
      break;
    case 'spin':
      subject = 'Reset S-PIN - Shaastra Wallet';
      bodyText = `You requested to reset your S-PIN. Your OTP is: <b>${otp}</b>`;
      break;
    case 'register':
    default:
      subject = 'Welcome to Shaastra Wallet - Registration OTP';
      bodyText = `Your OTP for registration is: <b>${otp}</b>`;
      break;
  }

  const mailOptions = {
    from: '"Shaastra" <noreply@shaastra.org>', 
    to: to,
    subject: subject,
    text: bodyText.replace(/<b>|<\/b>/g, ''), 
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>${subject}</h2>
        <p>${bodyText}</p>
        <p>It is valid for 10 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email Service] ${type} OTP sent to ${to}`);
  } catch (error) {
    console.error('[Email Service] Error:', error);
    throw new Error('Email delivery failed');
  }
};

module.exports = { sendOtpEmail };