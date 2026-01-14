const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Explicit CORS for production frontend
app.use(cors({
  origin: ["https://poker-chips-frontend.vercel.app", "http://localhost:5173"],
  methods: ["GET", "POST"]
}));

app.use(express.json());

// Root route to fix "Cannot GET /" and provide health check
app.get('/', (req, res) => {
  res.json({ message: "Poker Chips Backend is running ⚡" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://poker-chips-frontend.vercel.app", "http://localhost:5173"],
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('create-room', ({ roomId, initialChips }) => {
    rooms.set(roomId, {
      id: roomId,
      players: [],
      initialChips,
      pot: 0,
      logs: [`Room created with ${initialChips} initial chips`]
    });
    console.log(`Room created: ${roomId}`);
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.players.find(p => p.name === playerName)) {
        const existing = room.players.find(p => p.name === playerName);
        existing.id = socket.id;
      } else {
        const newPlayer = {
          id: socket.id,
          name: playerName,
          chips: room.initialChips,
          bet: 0
        };
        room.players.push(newPlayer);
        room.logs.unshift(`${playerName} joined the room`);
      }
      socket.join(roomId);
      io.to(roomId).emit('room-update', room);
      console.log(`${playerName} joined room ${roomId}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('place-bet', ({ roomId, amount }) => {
    const room = rooms.get(roomId);
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player && player.chips >= amount) {
        player.chips -= amount;
        player.bet += amount;
        room.pot += amount;
        room.logs.unshift(`${player.name} bet ${amount}`);
        io.to(roomId).emit('room-update', room);
      }
    }
  });

  socket.on('win-pot', ({ roomId, winnerId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) {
        const winAmount = room.pot;
        winner.chips += winAmount;
        room.pot = 0;
        room.players.forEach(p => p.bet = 0);
        room.logs.unshift(`${winner.name} won the pot of ${winAmount}`);
        io.to(roomId).emit('room-update', room);
      }
    }
  });

  socket.on('reset-game', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      room.pot = 0;
      room.players.forEach(p => {
        p.chips = room.initialChips;
        p.bet = 0;
      });
      room.logs.unshift(`Game reset by host`);
      io.to(roomId).emit('room-update', room);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('room-update', room);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = server;
