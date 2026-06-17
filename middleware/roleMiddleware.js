const isFinanceCore = async (req, res, next) => {
  const User = require('../models/User');
  try {
    const user = await User.findByPk(req.user.id);
    const isFinance = (user.department === 'Finance' && user.role === 'Core') || user.role === 'Finance Core';
    const isWebOps = (user.department === 'WebOps' && user.role === 'Core') || user.role === 'WebOps Core'; 
    if (user && (isFinance || isWebOps)) {
      next(); 
    } else {
      res.status(403).json({ message: 'Forbidden: Access is restricted to Finance and WebOps Core members.' });
    }
  } catch (error) {
    console.error(error); 
    res.status(500).json({ message: 'Error checking user role.' });
  }
};

const isCore = async (req, res, next) => {
  const User = require('../models/User');
  try {
    const user = await User.findByPk(req.user.id);
    if (user && (user.role === 'Core' || user.role === 'Finance Core' || user.role === 'WebOps Core')) {
      next(); 
    } else {
      res.status(403).json({ message: 'Forbidden: Access is restricted to Core members.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error checking user role.' });
  }
};

module.exports = { isFinanceCore, isCore };