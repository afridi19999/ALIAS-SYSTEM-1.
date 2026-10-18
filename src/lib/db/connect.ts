import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose | null> | null;
  isAvailable: boolean | null;
  lastFailureTime: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || {
  conn: null,
  promise: null,
  isAvailable: null,
  lastFailureTime: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Attempts connection to MongoDB with a short timeout.
 * If offline, caches the failure state for 60 seconds so operations execute at sub-millisecond speeds.
 */
export async function dbConnect(): Promise<typeof mongoose | null> {
  if (cached.conn && mongoose.connection.readyState === 1) {
    cached.isAvailable = true;
    return cached.conn;
  }

  // If recently failed within the last 60 seconds, immediately return null to use fast fallback
  const now = Date.now();
  if (cached.lastFailureTime && now - cached.lastFailureTime < 60000) {
    return null;
  }

  if (!MONGODB_URI || MONGODB_URI.includes("localhost:27017/dummy")) {
    // If it's the unconfigured default dummy or empty, test with quick timeout
  }

  if (!cached.promise) {
    const uri = MONGODB_URI || "mongodb://127.0.0.1:27017/ai_marketing_agency";
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 2500, // 2.5s timeout instead of default 30s
      connectTimeoutMS: 3000,
    };

    cached.promise = mongoose
      .connect(uri, opts)
      .then((m) => {
        cached.isAvailable = true;
        return m;
      })
      .catch((err) => {
        console.warn("[Database] MongoDB connection failed or offline. Operating in Resilient Local Demo Storage Mode.", err.message);
        cached.isAvailable = false;
        cached.lastFailureTime = Date.now();
        cached.promise = null;
        return null;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch {
    cached.promise = null;
    cached.conn = null;
    cached.isAvailable = false;
    cached.lastFailureTime = Date.now();
    return null;
  }
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export default dbConnect;
