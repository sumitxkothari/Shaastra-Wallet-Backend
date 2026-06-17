const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { sequelize } = require('./config/database');
const http = require('http'); 
const { Server } = require('socket.io'); 

// --- IMPORT MODELS ---
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Group = require('./models/Group');

// --- DEFINE ASSOCIATIONS ---
User.hasMany(Transaction, { as: 'SentTransactions', foreignKey: 'senderId' });
User.hasMany(Transaction, { as: 'ReceivedTransactions', foreignKey: 'receiverId' });
Transaction.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Transaction.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });
User.hasMany(Group, { foreignKey: 'createdById' });
Group.belongsTo(User, { as: 'Creator', foreignKey: 'createdById' });
User.belongsToMany(Group, { through: 'UserGroup' });
Group.belongsToMany(User, { through: 'UserGroup' });

// --- CONFIGURATION ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server (Needed for Socket.io)
const server = http.createServer(app);

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
  cors: {
    // Allow connections from React (localhost:3000) and your production domains
    origin: [
      "http://localhost:3000", 
      "http://127.0.0.1:3000",
      "https://coupons-2k26-ix5a8.ondigitalocean.app",
      "https://coupons.shaastra.org"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --- SOCKET CONNECTION LOGIC ---
io.on("connection", (socket) => {
  console.log(`⚡ [SERVER] New Connection: ${socket.id}`);

  // Handle the 'join_room' event from the frontend
  socket.on("join_room", (roomName) => {
    if (roomName) {
        // Force Uppercase to ensure matches (e.g., 'me22b034' -> 'ME22B034')
        const normalizedRoom = roomName.toUpperCase();
        
        socket.join(normalizedRoom);
        
        console.log(`✅ Socket ${socket.id} JOINED ROOM: ${normalizedRoom}`);
        
        // Send confirmation back to frontend (Required for the '🔒' log)
        socket.emit("room_joined_status", { status: "success", room: normalizedRoom });
    } else {
        console.log(`⚠️ Socket ${socket.id} tried to join empty room.`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ [SERVER] Disconnected: ${socket.id}`);
  });
});

// Share 'io' instance with routes (Critical for wallet.js)
app.set('io', io);

// --- DATABASE CONNECTION ---
const testDbConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL database connected successfully!');
    await sequelize.sync({ alter: true });
    console.log("All models were synchronized successfully.");
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};
testDbConnection();

// --- MIDDLEWARE ---
app.set('trust proxy', 1); 
app.use(cors({ 
    origin: [
        'http://localhost:3000', 
        'http://127.0.0.1:3000',                          
        'https://coupons-2k26-ix5a8.ondigitalocean.app',
        'https://coupons.shaastra.org'     
    ], 
    credentials: true 
}));
app.use(express.json());

// --- ROUTES ---
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const groupRoutes = require('./routes/groups');
const walletRoutes = require('./routes/wallet');
const vendorManagementRoutes = require('./routes/vendorManagement');

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/vendor-management', vendorManagementRoutes);

app.get('/', (req, res) => {
  res.send('Shaastra Wallet API is running with PostgreSQL...');
});

// --- START SERVER ---
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});