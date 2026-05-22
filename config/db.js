// ============================================================
// config/db.js — MongoDB Connection Setup
// ============================================================
// Mongoose is a library that acts as a bridge between Node.js
// and MongoDB. It lets us define data schemas, run queries,
// and interact with the database using JavaScript objects.
// ============================================================

const mongoose = require("mongoose");

// connectDB is an async function because connecting to a remote
// database takes time — we need to "await" the result.
const connectDB = async () => {
  try {
    // mongoose.connect() returns a connection object.
    // process.env.MONGO_URI is read from your .env file.
    const conn = await mongoose.connect(process.env.MONGO_URI);

    // conn.connection.host tells us which MongoDB server we connected to.
    // Useful to confirm you're hitting the right cluster.
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // If connection fails (wrong URI, no internet, etc.), log the error
    // and exit the process. There's no point running the server without a DB.
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Exit with failure code
  }
};

module.exports = connectDB;
