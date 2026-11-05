const mongoose = require('mongoose');
const net = require('net');

let mongodInstance = null;

function isPortOpen(host, port, timeout = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(true);
      }
    });
    const onFail = () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(false);
      }
    };
    socket.once('timeout', onFail);
    socket.once('error', onFail);
    socket.connect(port, host);
  });
}

const connectDB = async () => {
  // If user provided a specific URI in environment, use it
  if (process.env.MONGODB_URI) {
    const uri = process.env.MONGODB_URI;
    try {
      await mongoose.connect(uri);
      console.log(`[Database] Connected to external MongoDB at ${uri}`);
      return;
    } catch (err) {
      console.error(`[Database] Failed to connect to MONGODB_URI: ${err.message}`);
    }
  }

  // Fast check if local MongoDB daemon is running on port 27017
  const hasLocalMongo = await isPortOpen('127.0.0.1', 27017, 300);

  if (hasLocalMongo) {
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/notesync');
      console.log(`[Database] Connected to local MongoDB daemon (127.0.0.1:27017)`);
      return;
    } catch (err) {
      console.warn(`[Database] Could not connect to local daemon: ${err.message}`);
    }
  }

  // Start in-memory MongoDB fallback
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create();
    const inMemoryUri = mongodInstance.getUri();
    await mongoose.connect(inMemoryUri);
    console.log(`[Database] In-memory MongoDB running at ${inMemoryUri}`);
  } catch (memErr) {
    console.error('[Database] Failed to start in-memory MongoDB:', memErr.message);
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
};

module.exports = { connectDB, disconnectDB };
