import { MongoClient } from 'mongodb';
import { getMongoDbName, getMongoUrl } from '../config/mongoConfig.js';

let mongoClient;
let localMongoClient;
let accountInfoCollection;
let personalInfoCollection;
let bidRecordsCollection;
let cloudBidRecordsCollection;
let localBidRecordsCollection;
let mongoReady = false;
let mongoConnectError = null;
let localMongoReady = false;
let localMongoConnectError = null;

function getLocalMongoUrl() {
  return String(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017').trim();
}

function getLocalMongoDbName() {
  return String(process.env.MONGO_DB || 'AthensDB').trim();
}

async function initMongo() {
  mongoReady = false;
  mongoConnectError = null;
  localMongoReady = false;
  localMongoConnectError = null;

  const cloudMongoUrl = getMongoUrl();
  const cloudMongoDbName = getMongoDbName();
  try {
    mongoClient = new MongoClient(cloudMongoUrl);
    await mongoClient.connect();
    const db = mongoClient.db(cloudMongoDbName);
    accountInfoCollection = db.collection('account_info');
    personalInfoCollection = db.collection('personal_info');
    cloudBidRecordsCollection = db.collection('bid_records');
    await cloudBidRecordsCollection.createIndex({ sessionId: 1, createdAt: 1 });
    mongoReady = true;
    console.log('[vender-server] Connected to MongoDB cloud', cloudMongoDbName);
  } catch (err) {
    mongoConnectError = err instanceof Error ? err.message : String(err);
    console.error('[vender-server] MongoDB cloud connection failed:', mongoConnectError);
    accountInfoCollection = null;
    personalInfoCollection = null;
    cloudBidRecordsCollection = null;
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {
        // ignore
      }
      mongoClient = null;
    }
  }

  const localMongoUrl = getLocalMongoUrl();
  const localMongoDbName = getLocalMongoDbName();
  try {
    localMongoClient = new MongoClient(localMongoUrl);
    await localMongoClient.connect();
    const localDb = localMongoClient.db(localMongoDbName);
    localBidRecordsCollection = localDb.collection('bid_records');
    await localBidRecordsCollection.createIndex({ sessionId: 1, createdAt: 1 });
    localMongoReady = true;
    console.log('[vender-server] Connected to local MongoDB bid_records', localMongoDbName);
  } catch (err) {
    localMongoConnectError = err instanceof Error ? err.message : String(err);
    console.error('[vender-server] Local MongoDB connection failed:', localMongoConnectError);
    localBidRecordsCollection = null;
    if (localMongoClient) {
      try {
        await localMongoClient.close();
      } catch {
        // ignore
      }
      localMongoClient = null;
    }
  }

  bidRecordsCollection = createBidRecordsRouter();
}

async function pingMongo() {
  if (!mongoReady || !mongoClient) {
    return { ok: false, error: mongoConnectError || 'MongoDB cloud not connected' };
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
    cloudConnected: mongoReady,
    cloudError: mongoConnectError,
    localConnected: localMongoReady,
    localError: localMongoConnectError,
  };
}

function normalizeStorageTarget(value) {
  return value === 'local' ? 'local' : 'cloud';
}

function getBidRecordsCollection(storageTarget = 'cloud') {
  const target = normalizeStorageTarget(storageTarget);
  const collection = target === 'local' ? localBidRecordsCollection : cloudBidRecordsCollection;
  if (!collection) {
    const error = target === 'local' ? localMongoConnectError : mongoConnectError;
    throw new Error(
      `${target === 'local' ? 'Local' : 'Cloud'} bid records database is not connected${
        error ? `: ${error}` : ''
      }.`,
    );
  }
  return collection;
}

function createBidRecordsRouter() {
  return {
    async insertOne(doc, options) {
      return getBidRecordsCollection(doc?.storageTarget).insertOne(doc, options);
    },
  };
}

async function closeMongo() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
  if (localMongoClient) {
    await localMongoClient.close();
    localMongoClient = null;
  }
  accountInfoCollection = null;
  personalInfoCollection = null;
  bidRecordsCollection = null;
  cloudBidRecordsCollection = null;
  localBidRecordsCollection = null;
  mongoReady = false;
  mongoConnectError = null;
  localMongoReady = false;
  localMongoConnectError = null;
}

export {
  initMongo,
  closeMongo,
  pingMongo,
  getMongoStatus,
  getBidRecordsCollection,
  accountInfoCollection,
  personalInfoCollection,
  bidRecordsCollection,
  cloudBidRecordsCollection,
  localBidRecordsCollection,
};
