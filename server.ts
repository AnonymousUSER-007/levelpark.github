import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms: Record<string, any> = {};

const defaultGameState = () => ({
  levelIndex: 0,
  isPaused: false,
  switchPressed: false,
  doorOpen: false,
  traps: {
    fakePlatform: false,
    hiddenSpikes: false,
    ceilingBlock: false,
    doorMoves: false,
    invisibleWall: false,
    movingSpike: false,
  },
  box: { x: -100, y: -100 },
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinRoom", ({ roomId, playerName, maxPlayers }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, gameState: defaultGameState(), maxPlayers };
    }

    const room = rooms[roomId];
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    const color = colors[Object.keys(room.players).length % colors.length];

    room.players[socket.id] = { id: socket.id, name: playerName, x: 50, y: 450, color, isDead: false };

    socket.emit("roomState", { players: room.players, gameState: room.gameState, myId: socket.id });
    socket.to(roomId).emit("playerJoined", room.players[socket.id]);

    socket.on("playerMove", (data) => {
      if (room.players[socket.id]) {
        room.players[socket.id] = { ...room.players[socket.id], ...data };
        socket.to(roomId).emit("playerMoved", { id: socket.id, ...data });
      }
    });

    socket.on("chatMessage", (text) => {
      io.to(roomId).emit("chatMessage", { id: socket.id, name: playerName, text });
    });

    socket.on("switchPressed", (isPressed) => {
      room.gameState.switchPressed = isPressed;
      room.gameState.doorOpen = isPressed;
      io.to(roomId).emit("switchStateChanged", { switchPressed: isPressed, doorOpen: isPressed });
    });

    socket.on("boxMoved", (data) => {
      room.gameState.box = data;
      socket.to(roomId).emit("boxMoved", data);
    });

    socket.on("trapTriggered", (trapId) => {
      room.gameState.traps[trapId] = true;
      io.to(roomId).emit("trapActivated", trapId);
    });

    socket.on("playerDie", () => {
      if (room.players[socket.id]) {
        room.players[socket.id].isDead = true;
        io.to(roomId).emit("playerDied", socket.id);
        
        const allDead = Object.values(room.players).every((p: any) => p.isDead);
        if (allDead) {
          room.gameState = defaultGameState();
          Object.values(room.players).forEach((p: any) => { p.isDead = false; p.x = 50; p.y = 450; });
          io.to(roomId).emit("levelRestart", { players: room.players, gameState: room.gameState });
        }
      }
    });

    socket.on("playerReachedExit", () => {
      io.to(roomId).emit("levelComplete");
    });

    socket.on("disconnect", () => {
      if (rooms[roomId]) {
        delete rooms[roomId].players[socket.id];
        io.to(roomId).emit("playerLeft", socket.id);
        if (Object.keys(rooms[roomId].players).length === 0) delete rooms[roomId];
      }
    });
  });
});

async function startServer() {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "custom" });
  app.use(vite.middlewares);
  const PORT = process.env.PORT || 5173;
  server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

startServer();