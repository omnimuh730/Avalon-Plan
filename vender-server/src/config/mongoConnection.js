/**
 * Normalize Atlas connection strings for vender-server.
 *
 * Atlas shared-tier clusters often fail with multi-host seed lists + replicaSet
 * ("Server selection timed out"). SRV works when DNS allows it; otherwise use
 * directConnection=true to a single shard host (must hit the primary for writes).
 */

import { MongoClient } from 'mongodb';

function parseQuery(rest) {
  const query = rest.startsWith('?') ? rest.slice(1) : rest.startsWith('&') ? rest.slice(1) : '';
  return new URLSearchParams(query);
}

function buildQuery(params) {
  const s = params.toString();
  return s ? `?${s}` : '';
}

function splitMongoUrl(url) {
  const credsAndHosts = url.slice('mongodb://'.length);
  const at = credsAndHosts.lastIndexOf('@');
  if (at === -1) return null;

  const creds = credsAndHosts.slice(0, at);
  const hostAndRest = credsAndHosts.slice(at + 1);
  const slash = hostAndRest.indexOf('/');
  const hostsPart = slash === -1 ? hostAndRest : hostAndRest.slice(0, slash);
  const rest = slash === -1 ? '' : hostAndRest.slice(slash);
  const hosts = hostsPart.split(',').map((h) => h.trim()).filter(Boolean);
  if (hosts.length === 0) return null;

  return { creds, hosts, rest };
}

function replaceMongoHost(url, host) {
  const parts = splitMongoUrl(url);
  if (!parts) return url;
  return `mongodb://${parts.creds}@${host}${parts.rest}`;
}

/** @param {string} host e.g. ac-xxx-shard-00-00.cluster.mongodb.net:27017 */
function shardHostVariants(host) {
  const match = host.match(/^(.*-shard-00-)\d{2}(\.[^/]+)$/);
  if (!match) return [host];
  return ['00', '01', '02'].map((n) => `${match[1]}${n}${match[2]}`);
}

/**
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeCloudMongoUrl(rawUrl) {
  const url = String(rawUrl ?? '').trim();
  if (!url) return url;
  if (url.startsWith('mongodb+srv://')) return url;
  if (!url.startsWith('mongodb://')) return url;

  const parts = splitMongoUrl(url);
  if (!parts) return url;

  const params = parseQuery(parts.rest.includes('?') ? parts.rest.slice(parts.rest.indexOf('?')) : '');
  if (params.get('directConnection') === 'true') return url;
  if (process.env.MONGO_CLOUD_DIRECT === '0') return url;

  const firstHost = parts.hosts[0];
  params.delete('replicaSet');
  params.set('ssl', params.get('ssl') ?? 'true');
  params.set('authSource', params.get('authSource') ?? 'admin');
  params.set('directConnection', 'true');

  return `mongodb://${parts.creds}@${firstHost}/${buildQuery(params)}`;
}

/**
 * @returns {import('mongodb').MongoClientOptions}
 */
export function getCloudMongoClientOptions() {
  const options = {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_MS || 15_000),
  };

  if (process.env.MONGO_IPV4_ONLY === '1') {
    options.family = 4;
  }

  return options;
}

async function isWritablePrimary(client) {
  const hello = await client.db('admin').command({ hello: 1 });
  return Boolean(hello.isWritablePrimary ?? hello.ismaster);
}

/**
 * Connect to cloud MongoDB, auto-finding the primary when using directConnection.
 * @param {string} rawUrl
 * @returns {Promise<MongoClient>}
 */
export async function connectCloudMongo(rawUrl) {
  const normalized = normalizeCloudMongoUrl(rawUrl);
  const options = getCloudMongoClientOptions();

  if (normalized.startsWith('mongodb+srv://')) {
    const client = new MongoClient(normalized, options);
    await client.connect();
    return client;
  }

  if (normalized.includes('directConnection=true')) {
    const parts = splitMongoUrl(normalized);
    if (!parts) {
      throw new Error('Invalid MONGO_CLOUD_URL');
    }

    const hostsToTry = [
      ...new Set(parts.hosts.flatMap((host) => shardHostVariants(host))),
    ];
    let lastError = null;

    for (const host of hostsToTry) {
      const testUrl = replaceMongoHost(normalized, host);
      const client = new MongoClient(testUrl, {
        ...options,
        serverSelectionTimeoutMS: Math.min(options.serverSelectionTimeoutMS ?? 15_000, 8_000),
      });

      try {
        await client.connect();
        if (await isWritablePrimary(client)) {
          return client;
        }
        await client.close();
      } catch (err) {
        lastError = err;
        await client.close().catch(() => {});
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No writable MongoDB primary found');
  }

  const client = new MongoClient(normalized, options);
  await client.connect();
  return client;
}
