const { Server } = require("socket.io");

let io;

const ALLOWED_ORIGINS = [
  "https://sharhood-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

module.exports = {
  init: (httpServer) => {
    io = new Server(httpServer, {
      cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Allow both polling and websocket transports.
      // Polling is critical for Railway (and most reverse proxies)
      // because WebSocket upgrades are sometimes blocked.
      transports: ["polling", "websocket"],
      // More lenient ping settings for proxy environments
      pingTimeout: 60000,    // How long to wait for a pong before disconnecting
      pingInterval: 25000,   // How often to ping (default 25s)
      // Allow clients that don't upgrade to websocket to keep using polling
      allowUpgrades: true,
      // Increase max buffer size for payload
      maxHttpBufferSize: 1e6,
    });

    io.on("connection", (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id} via ${socket.conn.transport.name}`);

      // When a user authenticates on the frontend, they join a room with their userId
      socket.on("join", (userId) => {
        if (userId) {
          socket.join(userId);
          console.log(`[Socket.io] User ${userId} joined room`);
        }
      });

      socket.on("disconnect", (reason) => {
        console.log(`[Socket.io] Client disconnected: ${socket.id} — reason: ${reason}`);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error("[Socket.io] Not initialized — call init(httpServer) first!");
    }
    return io;
  },
};
