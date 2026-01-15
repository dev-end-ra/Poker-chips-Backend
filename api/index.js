const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Update CORS to allow any subdomains of vercel.app and localhost for development
const allowedOrigins = [
  "https://poker-chips-frontend.vercel.app",
  "https://poker-orjq.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app") || origin.endsWith(".onrender.com")) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

// Root route to fix "Cannot GET /" and provide health check
app.get('/', (req, res) => {
  res.json({ message: "Poker Chips Backend is running ⚡" });
});

const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  addTrailingSlash: false,
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app") || origin.endsWith(".onrender.com")) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('create-room', ({ roomId, initialChips }) => {
    const cleanRoomId = roomId.trim();
    rooms.set(cleanRoomId, {
      id: cleanRoomId,
      players: [],
      initialChips: Number(initialChips) || 1000,
      pot: 0,
      logs: [`Room created with ${initialChips} initial chips`],
      hostId: socket.id // The creator is the host
    });
    console.log(`Room created: ${cleanRoomId}`);
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const cleanRoomId = roomId.trim();
    const cleanPlayerName = playerName.trim();
    const room = rooms.get(cleanRoomId);
    
    if (room) {
      // If room has no host (e.g. from a previous session that crashed), take over
      if (!room.hostId) room.hostId = socket.id;

      const existingPlayer = room.players.find(p => p.name === cleanPlayerName);
      if (existingPlayer) {
        existingPlayer.id = socket.id;
        room.logs.unshift(`${cleanPlayerName} reconnected`);
      } else {
        const newPlayer = {
          id: socket.id,
          name: cleanPlayerName,
          chips: room.initialChips,
          bet: 0
        };
        room.players.push(newPlayer);
        room.logs.unshift(`${cleanPlayerName} joined the room`);
      }
      socket.join(cleanRoomId);
      io.to(cleanRoomId).emit('room-update', room);
      console.log(`${cleanPlayerName} joined room ${cleanRoomId}`);
    } else {
      console.log(`Join attempt for non-existent room: ${cleanRoomId}`);
      socket.emit('error', 'Room not found. Please check the ID or create a new one.');
    }
  });

  socket.on('place-bet', ({ roomId, amount }) => {
    const room = rooms.get(roomId.trim());
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player && player.chips >= amount) {
        player.chips -= amount;
        player.bet += amount;
        room.pot += amount;
        room.logs.unshift(`${player.name} bet ${amount}`);
        io.to(room.id).emit('room-update', room);
      }
    }
  });

  socket.on('win-pot', ({ roomId, winnerId }) => {
    const room = rooms.get(roomId.trim());
    if (room && room.hostId === socket.id) { // Only host can award pot
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) {
        const winAmount = room.pot;
        winner.chips += winAmount;
        room.pot = 0;
        room.players.forEach(p => p.bet = 0);
        room.logs.unshift(`${winner.name} won the pot of ${winAmount}`);
        io.to(room.id).emit('room-update', room);
      }
    }
  });

  socket.on('reset-game', (roomId) => {
    const room = rooms.get(roomId.trim());
    if (room && room.hostId === socket.id) { // Only host can reset
      room.pot = 0;
      room.players.forEach(p => {
        p.chips = room.initialChips;
        p.bet = 0;
      });
      room.logs.unshift(`Game reset by host`);
      io.to(room.id).emit('room-update', room);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    // Note: hostId remains even if host disconnects, allowing them to reconnect as host
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = server;
