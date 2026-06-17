const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // DEBUG LOG: Request received
  console.log(`🛡️ AUTH CHECK: ${req.method} ${req.originalUrl}`);

  // 1. Get token from the 'Authorization' header
  const authHeader = req.header('Authorization');
  
  if (!authHeader) {
    console.warn("❌ AUTH FAILED: No Authorization Header present.");
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // The header format is "Bearer <token>"
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.warn("❌ AUTH FAILED: Header present but Token is missing/malformed.");
    return res.status(401).json({ message: 'Access denied. Token is malformed.' });
  }

  try {
    // 2. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Attach user info to the request object
    req.user = decoded.user;
    
    // DEBUG LOG: Success
    console.log(`✅ AUTH SUCCESS: User ${req.user.id} (${req.user.role || 'No Role'})`);
    
    next(); // Proceed to the next function
  } catch (ex) {
    console.error("❌ AUTH FAILED: Token verification failed:", ex.message);
    res.status(400).json({ message: 'Invalid token.' });
  }
};

module.exports = authMiddleware;