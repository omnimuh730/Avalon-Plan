/**
 * Athens-only session + Bid Ready queue for Bid-Monitor.
 * No mock pools or seed jobs.
 */
const MockApi = (() => {
  const AUTH_KEY = 'auth';

  async function getAuth() {
    const { [AUTH_KEY]: auth = null } = await chrome.storage.local.get(AUTH_KEY);
    return auth;
  }

  async function signIn(_username, _password, options = {}) {
    const applierName = String(options.applierName || '').trim();
    const apiUrl = String(options.apiUrl || '').trim();
    const displayName = String(options.displayName || _username || applierName).trim() || applierName;

    if (!applierName) {
      return {
        ok: false,
        error: 'Athens applier name is required (your Job Search profile name).',
      };
    }

    await AthensApi.saveSettings({
      applierName,
      apiUrl: apiUrl || AthensApi.DEFAULT_API_URL,
    });

    const auth = {
      profileName: applierName.toLowerCase().replace(/\s+/g, '-'),
      displayName,
      applierName,
      role: 'bidder',
      signedInAt: new Date().toISOString(),
      source: 'athens',
    };
    await chrome.storage.local.set({ [AUTH_KEY]: auth });

    const dashboard = await getDashboardState();
    return {
      ok: true,
      auth: dashboard.auth,
      pools: dashboard.pools,
      athensError: dashboard.athensError,
    };
  }

  async function signOut() {
    await chrome.storage.local.remove(AUTH_KEY);
    return { ok: true };
  }

  async function getDashboardState() {
    const auth = await getAuth();
    if (!auth) return { ok: true, auth: null, pools: [], athensError: null, source: null };

    const settings = await AthensApi.getSettings();
    const applierName = settings.applierName || auth.applierName || auth.displayName;
    const nextAuth = { ...auth, applierName, role: 'bidder', source: 'athens' };

    if (!applierName) {
      return {
        ok: true,
        auth: nextAuth,
        pools: [],
        athensError: 'Set an Athens applier name to load Bid Ready jobs.',
        source: 'athens',
      };
    }

    try {
      const pools = await AthensApi.fetchBidReadyPools(applierName, settings.apiUrl);
      return {
        ok: true,
        auth: nextAuth,
        pools,
        athensError: null,
        source: 'athens',
      };
    } catch (err) {
      return {
        ok: true,
        auth: nextAuth,
        pools: [
          {
            id: 'athens-bid-ready',
            name: 'Bid Ready',
            status: 'active',
            profileName: applierName,
            source: 'athens',
            jobs: [],
          },
        ],
        athensError: err instanceof Error ? err.message : String(err),
        source: 'athens',
      };
    }
  }

  function findPool(pools, poolId) {
    return pools.find((pool) => pool.id === poolId) ?? null;
  }

  function findJob(pool, jobId) {
    return pool?.jobs?.find((job) => job.id === jobId) ?? null;
  }

  return {
    signIn,
    signOut,
    getAuth,
    getDashboardState,
    findPool,
    findJob,
    // Stubs kept so older message handlers fail gracefully (no mock pools).
    getPoolsForProfile: async () => [],
    markJobApplied: async () => null,
    resetActiveJobs: async () => ({ ok: false, error: 'Demo reset removed — use Athens Bid Ready.' }),
    getPoolDownloadEntries: () => [],
    getUniqueResumeFolders: () => [],
    getMockCredentialsHint: () => ({ profiles: [], ownerPassword: '', bidderPassword: '' }),
  };
})();
