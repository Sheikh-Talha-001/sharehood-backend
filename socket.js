const { Server } = require("socket.io");

let io;

module.exports = {
  init: (httpServer) => {
    io = new Server(httpServer, {
      cors: {
        origin: [
          "https://sharhood-frontend.vercel.app",
          "http://localhost:5173",
          "http://localhost:3000",
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        credentials: true
      },
    });

    io.on("connection", (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      // When a user authenticates on the frontend, they join a room with their userId
      socket.on("join", (userId) => {
        if (userId) {
          socket.join(userId);
          console.log(`[Socket.io] User ${userId} joined their personal room`);
        }
      });

      socket.on("disconnect", () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      });
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};
