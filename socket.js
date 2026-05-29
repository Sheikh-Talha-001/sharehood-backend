const { Server } = require("socket.io");

let io;

const ALLOWED_ORIGINS = [
  "https://sharhood-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Validate that a string looks like a valid MongoDB ObjectId
// (24 hex characters). This prevents arbitrary room names.
const isValidObjectId = (id) => /^[a-fA-F0-9]{24}$/.test(id);

module.exports = {
  init: (httpServer) => {
    io = new Server(httpServer, {
      cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["polling", "websocket"],
      pingTimeout: 60000,
      pingInterval: 25000,
      allowUpgrades: true,
      maxHttpBufferSize: 1e6,
    });

    io.on("connection", (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id} via ${socket.conn.transport.name}`);

      // When a user authenticates on the frontend, they join a room with their userId.
      // SECURITY: We validate the userId format before allowing the join.
      socket.on("join", (userId) => {
        if (userId && isValidObjectId(userId)) {
          socket.join(userId);
          console.log(`[Socket.io] User ${userId} joined room`);
        } else {
          console.warn(`[Socket.io] Rejected invalid room join attempt: ${userId}`);
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
