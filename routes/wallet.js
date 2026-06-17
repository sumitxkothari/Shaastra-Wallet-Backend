// routes/wallet.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore, isCore } = require('../middleware/roleMiddleware');
const { transactionLimiter, apiLimiter } = require('../middleware/rateLimiter');

// ============================================
// HELPER FUNCTION: Verify S-PIN
// ============================================
async function verifySPin(userId, sPin) {
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw new Error('User not found.');
  }
  
  if (!user.sPin) {
    throw new Error('S-Pin not set. Please set up your S-Pin first.');
  }
  
  const isPinValid = await bcrypt.compare(sPin, user.sPin);
  
  if (!isPinValid) {
    throw new Error('Invalid S-Pin. Transaction cancelled.');
  }
  
  return user;
}

// ============================================
// POST /api/wallet/send - SEND MONEY
// ============================================
router.post('/send', [authMiddleware, transactionLimiter], async (req, res) => {
  try {
    const { receiverId, amount, sPin } = req.body;
    
    if (!sPin) {
      return res.status(400).json({ message: 'S-Pin is required for transactions.' });
    }
    
    const numericAmount = Number(amount);
    
    try {
      await verifySPin(req.user.id, sPin);
    } catch (pinError) {
      return res.status(401).json({ message: pinError.message });
    }
    
    const result = await sequelize.transaction(async (t) => {
      const sender = await User.findByPk(req.user.id, { transaction: t });
      
      if (!sender || sender.balance < numericAmount) {
        throw new Error('Insufficient balance or user not found.');
      }

      const receiver = await User.findOne({ 
        where: { userId: receiverId.toUpperCase() }, 
        transaction: t 
      });
      
      if (!receiver) { 
        throw new Error('Receiver not found.'); 
      }
      
      if (sender.id === receiver.id) { 
        throw new Error('Cannot send money to yourself.'); 
      }

      sender.balance -= numericAmount;
      receiver.balance += numericAmount;

      await sender.save({ transaction: t });
      await receiver.save({ transaction: t });

      const newTransaction = await Transaction.create({
        senderId: sender.id, 
        receiverId: receiver.id,
        senderName: sender.name, 
        receiverName: receiver.name,
        senderUserId: sender.userId, 
        receiverUserId: receiver.userId,
        amount: numericAmount
      }, { transaction: t });

      // Real-time notification
      const io = req.app.get('io');
      
      // === DEBUG LOGS (Add these lines) ===
      console.log("------------------------------------------");
      console.log("🔍 DEBUG SOCKET EMIT:");
      console.log("1. IO Instance exists?", !!io);
      console.log("2. Target Receiver ID:", receiver.userId);
      console.log("3. Target Room (Upper):", receiver.userId ? receiver.userId.toUpperCase() : "UNDEFINED");
      console.log("4. Event Name:", "transaction_received");
      console.log("------------------------------------------");

      if (!io) {
          console.error("❌ CRITICAL ERROR: 'io' is undefined. Socket event cannot be sent.");
      } else {
          // Emit to Uppercase Room ID
          io.to(receiver.userId.toUpperCase()).emit("transaction_received", {
             id: newTransaction.id,
             amount: numericAmount,
             senderName: sender.name,
             senderUserId: sender.userId,
             createdAt: new Date(),
             type: 'credit'
          });
          console.log("✅ EMIT SUCCESS (Server thinks it sent it)");
      }

      io.to(sender.userId.toUpperCase()).emit("transaction_received", {
           id: newTransaction.id,
           amount: numericAmount,
           senderName: "You", // Or 'Self'
           receiverName: receiver.name,
           createdAt: new Date(),
           type: 'debit' // Mark as debit so frontend knows it is an expense
      });

      return { 
        message: 'Transaction successful!',
        transaction: newTransaction,
        newBalance: sender.balance
      };
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ message: error.message || 'Server error during transaction.' });
  }
});

// ============================================
// GET /api/wallet/history
// ============================================
router.get('/history', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const searchQuery = req.query.search || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const txType = req.query.type;

    let whereClause = {
      [Op.or]: [
        { senderId: req.user.id }, 
        { receiverId: req.user.id }
      ]
    };

    if (searchQuery) {
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { senderName: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverName: { [Op.iLike]: `%${searchQuery}%` } },
            { senderUserId: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverUserId: { [Op.iLike]: `%${searchQuery}%` } }
          ]
        }
      ];
    }

    if (startDate && endDate) {
      if (!whereClause[Op.and]) whereClause[Op.and] = [];
      whereClause[Op.and].push({
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      });
    }

    if (txType) {
      if (txType === 'sent') {
        whereClause.senderId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'received') {
        whereClause.receiverId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'topup') {
        whereClause.senderId = req.user.id;
        whereClause.receiverId = req.user.id;
      }
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      transactions: rows,
      pagination: {
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalTransactions: count,
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ message: 'Server error fetching history.' });
  }
});

// ============================================
// POST /api/wallet/topup
// ============================================
router.post('/topup', [authMiddleware, isFinanceCore, transactionLimiter], async (req, res) => {
    try {
        const { amount, sPin } = req.body;
        
        if (!sPin) {
          return res.status(400).json({ message: 'S-Pin is required for top-up.' });
        }
        
        const numericAmount = Number(amount);
        
        try {
          await verifySPin(req.user.id, sPin);
        } catch (pinError) {
          return res.status(401).json({ message: pinError.message });
        }
        
        const result = await sequelize.transaction(async (t) => {
            const user = await User.findByPk(req.user.id, { transaction: t });
            
            user.balance += numericAmount;
            await user.save({ transaction: t });

            await Transaction.create({
                senderId: user.id,
                receiverId: user.id,
                senderName: 'Shaastra Finance',
                receiverName: user.name,
                senderUserId: 'FINANCE_TOPUP',
                receiverUserId: user.userId,
                amount: numericAmount
            }, { transaction: t });

            return { 
                message: `Successfully topped up ₹${numericAmount.toFixed(2)}.`, 
                newBalance: user.balance 
            };
        });
        
        res.json(result);
        
    } catch (error) {
        console.error("Topup Error:", error);
        res.status(500).json({ message: error.message || 'Server error during top-up.' });
    }
});

// ============================================
// POST /api/wallet/send-group
// ============================================
router.post('/send-group', [authMiddleware, isCore, transactionLimiter], async (req, res) => {
  try {
    const { recipients, sPin } = req.body;
    
    if (!sPin) {
      return res.status(400).json({ message: 'S-Pin is required for group transactions.' });
    }
    
    try {
      await verifySPin(req.user.id, sPin);
    } catch (pinError) {
      return res.status(401).json({ message: pinError.message });
    }
    
    const result = await sequelize.transaction(async (t) => {
      const sender = await User.findByPk(req.user.id, { transaction: t });
      const totalAmountToSend = recipients.reduce((acc, r) => acc + r.amount, 0);

      if (!sender || sender.balance < totalAmountToSend) {
        throw new Error('Insufficient balance for group transaction.');
      }

      const receiverIds = recipients.map(r => r.receiverId.toUpperCase());
      const receivers = await User.findAll({ 
        where: { userId: { [Op.in]: receiverIds } },
        transaction: t 
      });

      const receiverMap = new Map();
      receivers.forEach(receiver => {
        receiverMap.set(receiver.userId, receiver);
      });

      const missingReceivers = receiverIds.filter(id => !receiverMap.has(id));
      if (missingReceivers.length > 0) {
        throw new Error(`Receiver(s) not found: ${missingReceivers.join(', ')}`);
      }

      const io = req.app.get('io');
      const successfulTransactions = [];
      const transactionsToCreate = [];

      for (const r of recipients) {
        const receiver = receiverMap.get(r.receiverId.toUpperCase());

        sender.balance -= r.amount;
        receiver.balance += r.amount;

        await receiver.save({ transaction: t });

        transactionsToCreate.push({
          senderId: sender.id, 
          receiverId: receiver.id,
          senderName: sender.name, 
          receiverName: receiver.name,
          senderUserId: sender.userId, 
          receiverUserId: receiver.userId,
          amount: r.amount
        });

        successfulTransactions.push({
          to: receiver.name,
          amount: r.amount
        });
      }

      const createdTransactions = await Transaction.bulkCreate(transactionsToCreate, { transaction: t });

      createdTransactions.forEach((newTxn, index) => {
        const r = recipients[index];
        const receiver = receiverMap.get(r.receiverId.toUpperCase());
        
        // Emit to Room ID (User ID)
        io.to(receiver.userId.toUpperCase()).emit("transaction_received", {
            id: newTxn.id,
            amount: r.amount,
            senderName: sender.name,
            createdAt: new Date(),
            type: 'credit'
         });
      });

      await sender.save({ transaction: t });
      
      return { 
        message: 'Group transaction successful!',
        totalSent: totalAmountToSend,
        recipientCount: recipients.length,
        newBalance: sender.balance,
        transactions: successfulTransactions
      };
    });
    
    res.json(result);
    
  } catch (error) {
      console.error('Group transaction error:', error);
      res.status(500).json({ message: error.message || 'Server error during group transaction.' });
  }
});

// ============================================
// GET /api/wallet/history/download
// ============================================
router.get('/history/download', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user.role !== 'Vendor') {
      return res.status(403).json({ message: 'This feature is only available for Vendors.' });
    }

    const searchQuery = req.query.search || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const txType = req.query.type;

    let whereClause = {
      [Op.or]: [
        { senderId: req.user.id }, 
        { receiverId: req.user.id }
      ]
    };

    if (searchQuery) {
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { senderName: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverName: { [Op.iLike]: `%${searchQuery}%` } },
            { senderUserId: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverUserId: { [Op.iLike]: `%${searchQuery}%` } }
          ]
        }
      ];
    }

    if (startDate && endDate) {
      if (!whereClause[Op.and]) whereClause[Op.and] = [];
      whereClause[Op.and].push({
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      });
    }

    if (txType) {
      if (txType === 'sent') {
        whereClause.senderId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'received') {
        whereClause.receiverId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'topup') {
        whereClause.senderId = req.user.id;
        whereClause.receiverId = req.user.id;
      }
    }

    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    const csvHeader = 'Date,Time,From/To ID,From/To Name,Credit,Debit\n';

    const csvRows = transactions.map(tx => {
      const isSender = tx.senderUserId === user.userId;
      const isTopUp = tx.senderUserId === tx.receiverUserId;

      let fromToId = '';
      let fromToName = '';
      let credit = '';
      let debit = '';

      if (isTopUp) {
        fromToId = 'SYSTEM';
        fromToName = 'System';
        credit = tx.amount.toFixed(2);
      } else if (isSender) {
        fromToId = tx.receiverUserId;
        fromToName = tx.receiverName;
        debit = tx.amount.toFixed(2);
      } else {
        fromToId = tx.senderUserId;
        fromToName = tx.senderName;
        credit = tx.amount.toFixed(2);
      }

      const dateObj = new Date(tx.createdAt);

      const date = dateObj.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const time = dateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const escapedName = `"${fromToName.replace(/"/g, '""')}"`;

      return `${date},${time},${fromToId},${escapedName},${credit},${debit}`;
    }).join('\n');


    const csvContent = csvHeader + csvRows;

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Shaastra_Transactions_${user.userId}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    res.send(csvContent);

  } catch (error) {
    console.error('Transaction download error:', error);
    res.status(500).json({ message: 'Server error downloading transactions.' });
  }
});

// ============================================
// POST /api/wallet/admin-reset-balances
// ============================================
router.post('/admin-reset-balances', [authMiddleware, isFinanceCore, transactionLimiter], async (req, res) => {
  try {
    const { targetType, userIds, sPin, reason } = req.body;
    
    if (!targetType || !['all', 'vendors', 'csv'].includes(targetType)) {
      return res.status(400).json({ message: 'Invalid target type. Must be "all", "vendors", or "csv".' });
    }
    
    if ((targetType === 'vendors' || targetType === 'csv') && (!userIds || !Array.isArray(userIds) || userIds.length === 0)) {
      return res.status(400).json({ message: 'User IDs are required for vendors or CSV mode.' });
    }
    
    if (!sPin) {
      return res.status(400).json({ message: 'S-Pin is required for balance reset.' });
    }
    
    try {
      await verifySPin(req.user.id, sPin);
    } catch (pinError) {
      return res.status(401).json({ message: pinError.message });
    }
    
    const result = await sequelize.transaction(async (t) => {
      const admin = await User.findByPk(req.user.id, { transaction: t });
      
      let usersToReset = [];
      
      if (targetType === 'all') {
        usersToReset = await User.findAll({
          where: {
            [Op.or]: [
              { role: { [Op.in]: ['Vendor', 'Head', 'Coordinator', 'Volunteer'] } },
              {
                [Op.and]: [
                  { role: 'Core' },
                  { department: { [Op.ne]: 'Finance' } }
                ]
              }
            ]
          },
          transaction: t
        });
      } else if (targetType === 'vendors') {
        usersToReset = await User.findAll({
          where: { 
            userId: { [Op.in]: userIds.map(id => id.toUpperCase()) },
            role: 'Vendor'
          },
          transaction: t
        });
      } else if (targetType === 'csv') {
        usersToReset = await User.findAll({
          where: { 
            userId: { [Op.in]: userIds.map(id => id.toUpperCase()) }
          },
          transaction: t
        });
      }
      
      if (usersToReset.length === 0) {
        throw new Error('No users found matching the criteria.');
      }
      
      let totalAmountReset = 0;
      let usersWithBalance = 0;
      const resetDetails = [];
      
      for (const user of usersToReset) {
        const previousBalance = user.balance;
        
        if (previousBalance > 0) {
          totalAmountReset += previousBalance;
          usersWithBalance++;
          
          await Transaction.create({
            senderId: user.id,
            receiverId: user.id,
            senderName: user.name,
            receiverName: 'System Reset',
            senderUserId: user.userId,
            receiverUserId: 'ADMIN_RESET',
            amount: previousBalance, 
            type: 'ADMIN_RESET',
            metadata: {
              resetBy: admin.userId,
              resetByName: admin.name,
              reason: reason || 'Balance reset by Finance Core',
              previousBalance: previousBalance,
              targetType: targetType,
              timestamp: new Date().toISOString()
            }
          }, { transaction: t });
          
          user.balance = 0;
          await user.save({ transaction: t });
          
          resetDetails.push({
            userId: user.userId,
            name: user.name,
            previousBalance: previousBalance
          });
        }
      }
      
      const io = req.app.get('io');
      
      for (const detail of resetDetails) {
        // EMIT TO ROOM ID (User ID)
        io.to(detail.userId.toUpperCase()).emit('balance_reset', {
            message: `Your wallet balance of ₹${detail.previousBalance.toFixed(2)} has been reset to ₹0.00`,
            resetBy: 'Finance Team',
            reason: reason || 'Daily balance reset',
            timestamp: new Date()
        });
      }
      
      return {
        success: true,
        totalUsers: usersToReset.length,
        usersWithBalance: usersWithBalance,
        totalAmountReset: totalAmountReset.toFixed(2),
        resetBy: admin.name,
        targetType: targetType,
        timestamp: new Date().toISOString(),
        details: resetDetails.slice(0, 10) 
      };
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Balance reset error:', error);
    res.status(500).json({ message: error.message || 'Server error during balance reset.' });
  }
});

module.exports = router;