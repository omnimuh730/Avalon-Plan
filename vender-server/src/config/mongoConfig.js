import {
  getMongoUrl as getEmbeddedMongoUrl,
  getMongoDbName as getEmbeddedMongoDbName,
} from './mongoSecrets.js';

// Cloud MongoDB connection. Prefer MONGO_CLOUD_URL / MONGO_CLOUD_DB from .env
// when set; otherwise fall back to the embedded (built-in) secrets.
export function getMongoUrl() {
  const fromEnv = process.env.MONGO_CLOUD_URL?.trim();
  return fromEnv || getEmbeddedMongoUrl();
}

export function getMongoDbName() {
  const fromEnv = process.env.MONGO_CLOUD_DB?.trim();
  return fromEnv || getEmbeddedMongoDbName();
}
