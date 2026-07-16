import { connectMongo } from '../config/mongoConnection.js';

let mongoClient;
let accountInfoCollection;
let personalInfoCollection;
let bidRecordsCollection;
let jobsCollection;
let mongoReady = false;
let mongoConnectError = null;

function getMongoUrl() {
  return String(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017').trim();
}

function getMongoDbName() {
  return String(process.env.MONGO_DB || 'AthensDB').trim();
}

async function initMongo() {
  mongoReady = false;
  mongoConnectError = null;
  accountInfoCollection = null;
  personalInfoCollection = null;
  bidRecordsCollection = null;
  jobsCollection = null;

  const mongoUrl = getMongoUrl();
  const mongoDbName = getMongoDbName();

  try {
    mongoClient = await connectMongo(mongoUrl);
    const db = mongoClient.db(mongoDbName);
    accountInfoCollection = db.collection('account_info');
    personalInfoCollection = db.collection('personal_info');
    bidRecordsCollection = db.collection('bid_records');
    jobsCollection = db.collection('job_market');
    await bidRecordsCollection.createIndex({ sessionId: 1, createdAt: 1 });
    mongoReady = true;
    console.log('[vender-server] Connected to MongoDB', mongoDbName);
  } catch (err) {
    mongoConnectError = err instanceof Error ? err.message : String(err);
    console.error('[vender-server] MongoDB connection failed:', mongoConnectError);
    accountInfoCollection = null;
    personalInfoCollection = null;
    bidRecordsCollection = null;
    jobsCollection = null;
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {
        // ignore
      }
      mongoClient = null;
    }
  }
}

async function pingMongo() {
  if (!mongoReady || !mongoClient) {
    return { ok: false, error: mongoConnectError || 'MongoDB not connected' };
  }
  try {
    await mongoClient.db().admin().command({ ping: 1 });
    return { ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    mongoReady = false;
    mongoConnectError = message;
    return { ok: false, error: message };
  }
}

function getMongoStatus() {
  return {
    connected: mongoReady,
    error: mongoConnectError,
  };
}

async function closeMongo() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
  accountInfoCollection = null;
  personalInfoCollection = null;
  bidRecordsCollection = null;
  jobsCollection = null;
  mongoReady = false;
  mongoConnectError = null;
}

export {
  initMongo,
  closeMongo,
  pingMongo,
  getMongoStatus,
  accountInfoCollection,
  personalInfoCollection,
  bidRecordsCollection,
  jobsCollection,
};
