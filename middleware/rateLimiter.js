// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// ============================================
// HELPER: LOGGING FUNCTION
// Prints a warning to the console when someone gets blocked
// ============================================
const logBlockedRequest = (req, type) => {
  const userId = req.user ? `User: ${req.user.id}` : 'Guest';
  const ip = req.ip;
  const timestamp = new Date().toLocaleTimeString();
  
  // \x1b[31m makes the text RED in the terminal so you spot it easily
  console.warn(`\x1b[31m⚠️ [${timestamp}] BLOCKED: ${type} Limit reached by ${userId} (IP: ${ip})\x1b[0m`);
};


// ============================================
// AUTH LIMITER
// ============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // 50 tries is plenty for a confused student
  message: {
    message: 'Too many login attempts. Please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, 
  handler: (req, res, next, options) => {
    res.status(429).json({
      message: options.message.message,
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  }
});

// ============================================
// TRANSACTION LIMITER (Keep at 1 Minute!)
// ============================================
const transactionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute (Keep short to stop scripts)
  max: 100, // High enough for bursts, safe enough for server
  message: {
    message: 'Transaction rate limit exceeded. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : req.ip;
  },
  handler: (req, res, next, options) => {
    res.status(429).json({
      message: options.message.message,
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  }
});

// ============================================
// STRICT LIMITER (OTP) -> CHANGED TO 15 MINS
// ============================================
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // CHANGED: 15 Minutes (Better for students)
  max: 5, // CHANGED: Limit is lower (5) because time is shorter
  message: {
    message: 'Too many OTP requests. Please wait 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, 
  keyGenerator: (req) => {
    return req.body.smail || req.ip;
  },
  handler: (req, res, next, options) => {
    res.status(429).json({
      message: options.message.message,
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  }
});

// ============================================
// API GENERAL LIMITER
// ============================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    message: 'Too many requests. Please slow down.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : req.ip;
  },
  handler: (req, res, next, options) => {
    res.status(429).json({
      message: options.message.message,
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  }
});

// ============================================
// VENDOR LIMITER (Keep at 1 Minute!)
// ============================================
const vendorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Vendors work fast, this controls bursts
  message: {
    message: 'Too many vendor requests. Please wait.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : req.ip;
  }
});

module.exports = {
  authLimiter,
  transactionLimiter,
  strictLimiter,
  apiLimiter,
  vendorLimiter
};