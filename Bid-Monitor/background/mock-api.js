const MockApi = (() => {
  const JOB_POOLS_KEY = 'jobPools';
  const AUTH_KEY = 'auth';

  const PROFILES = {
    demo: {
      displayName: 'Demo Profile',
      ownerPassword: 'owner123',
      bidderPassword: 'bidder123',
    },
    acme: {
      displayName: 'Acme Corp',
      ownerPassword: 'owner123',
      bidderPassword: 'bidder123',
    },
  };

  function normalizeUsername(username) {
    return String(username || '')
      .trim()
      .toLowerCase();
  }

  function createSeedPools(profileName) {
    return [
      {
        id: 'pool-active-q2',
        name: 'Q2 2026 Active Pool',
        status: 'active',
        profileName,
        jobs: [
          {
            id: 'job-du-swe',
            companyName: 'Defense Unicorns',
            title: 'Software Engineer',
            jdUrl: 'https://job-boards.greenhouse.io/defenseunicorns/jobs/5151114007',
            resumeFolderName: 'ResumeSet_042',
            status: 'not_applied',
            sessionId: null,
            appliedAt: null,
          },
          {
            id: 'job-stripe-eng',
            companyName: 'Stripe',
            title: 'Backend Engineer',
            jdUrl: 'https://job-boards.greenhouse.io/defenseunicorns/jobs/5151114007',
            resumeFolderName: 'ResumeSet_017',
            status: 'not_applied',
            sessionId: null,
            appliedAt: null,
          },
          {
            id: 'job-notion-pm',
            companyName: 'Notion',
            title: 'Product Manager',
            jdUrl: 'https://job-boards.greenhouse.io/embed/job_app?for=temporaltechnologies&jr_id=6a4d778ac643fd23fed3d239&token=5178158007&utm_source=jobright',
            resumeFolderName: 'ResumeSet_088',
            status: 'not_applied',
            sessionId: null,
            appliedAt: null,
          },
        ],
      },
      {
        id: 'pool-done-jan',
        name: 'January 2026 (Completed)',
        status: 'done',
        profileName,
        jobs: [
          {
            id: 'job-google-swe',
            companyName: 'Google',
            title: 'Software Engineer',
            jdUrl: 'https://careers.google.com/jobs/results/123456-software-engineer/',
            resumeFolderName: 'ResumeSet_003',
            status: 'applied',
            sessionId: null,
            appliedAt: '2026-01-15T10:30:00.000Z',
          },
          {
            id: 'job-meta-pm',
            companyName: 'Meta',
            title: 'Technical Program Manager',
            jdUrl: 'https://www.metacareers.com/jobs/123456/',
            resumeFolderName: 'ResumeSet_011',
            status: 'applied',
            sessionId: null,
            appliedAt: '2026-01-22T14:05:00.000Z',
          },
        ],
      },
    ];
  }

  function mergePoolState(seedPool, storedPool) {
    if (!storedPool) return seedPool;

    const storedJobs = new Map((storedPool.jobs ?? []).map((job) => [job.id, job]));
    return {
      ...seedPool,
      status: storedPool.status ?? seedPool.status,
      jobs: seedPool.jobs.map((seedJob) => {
        const storedJob = storedJobs.get(seedJob.id);
        if (!storedJob) return seedJob;
        return {
          ...seedJob,
          status: storedJob.status ?? seedJob.status,
          sessionId: storedJob.sessionId ?? seedJob.sessionId,
          appliedAt: storedJob.appliedAt ?? seedJob.appliedAt,
        };
      }),
    };
  }

  async function getStoredPools(profileName) {
    const { [JOB_POOLS_KEY]: jobPools = [] } = await chrome.storage.local.get(JOB_POOLS_KEY);
    return jobPools.filter((pool) => pool.profileName === profileName);
  }

  async function savePoolsForProfile(profileName, pools) {
    const { [JOB_POOLS_KEY]: jobPools = [] } = await chrome.storage.local.get(JOB_POOLS_KEY);
    const others = jobPools.filter((pool) => pool.profileName !== profileName);
    await chrome.storage.local.set({ [JOB_POOLS_KEY]: [...others, ...pools] });
  }

  async function getPoolsForProfile(profileName) {
    const seedPools = createSeedPools(profileName);
    const storedPools = await getStoredPools(profileName);
    const storedById = new Map(storedPools.map((pool) => [pool.id, pool]));
    const merged = seedPools.map((seedPool) => mergePoolState(seedPool, storedById.get(seedPool.id)));

    if (!storedPools.length) {
      await savePoolsForProfile(profileName, merged);
    }

    return merged;
  }

  async function getAuth() {
    const { [AUTH_KEY]: auth = null } = await chrome.storage.local.get(AUTH_KEY);
    return auth;
  }

  async function signIn(username, password) {
    const profileName = normalizeUsername(username);
    const profile = PROFILES[profileName];
    if (!profile) {
      return { ok: false, error: 'Invalid username or password.' };
    }

    let role = null;
    if (password === profile.ownerPassword) role = 'owner';
    else if (password === profile.bidderPassword) role = 'bidder';
    else return { ok: false, error: 'Invalid username or password.' };

    const auth = {
      profileName,
      displayName: profile.displayName,
      role,
      signedInAt: new Date().toISOString(),
    };

    const pools = await getPoolsForProfile(profileName);
    await chrome.storage.local.set({ [AUTH_KEY]: auth });
    return { ok: true, auth, pools };
  }

  async function signOut() {
    await chrome.storage.local.remove(AUTH_KEY);
    return { ok: true };
  }

  async function getDashboardState() {
    const auth = await getAuth();
    if (!auth) return { ok: true, auth: null, pools: [] };
    const pools = await getPoolsForProfile(auth.profileName);
    return { ok: true, auth, pools };
  }

  function findPool(pools, poolId) {
    return pools.find((pool) => pool.id === poolId) ?? null;
  }

  function findJob(pool, jobId) {
    return pool?.jobs?.find((job) => job.id === jobId) ?? null;
  }

  async function markJobApplied(profileName, poolId, jobId, sessionId) {
    const pools = await getPoolsForProfile(profileName);
    const pool = findPool(pools, poolId);
    const job = findJob(pool, jobId);
    if (!pool || !job) return null;

    job.status = 'applied';
    job.sessionId = sessionId;
    job.appliedAt = new Date().toISOString();

    await savePoolsForProfile(profileName, pools);
    return { pool, job };
  }

  async function resetActiveJobs(profileName) {
    const pools = await getPoolsForProfile(profileName);
    for (const pool of pools) {
      if (pool.status !== 'active') continue;
      for (const job of pool.jobs) {
        job.status = 'not_applied';
        job.sessionId = null;
        job.appliedAt = null;
      }
    }
    await savePoolsForProfile(profileName, pools);
    return { ok: true };
  }

  function getPoolDownloadEntries(pool) {
    return (pool?.jobs ?? []).map((job) => ({
      companyName: job.companyName,
      title: job.title,
      jdUrl: job.jdUrl,
      resumeFolderName: job.resumeFolderName,
      status: job.status,
    }));
  }

  function getUniqueResumeFolders(pool) {
    const folders = new Set();
    for (const job of pool?.jobs ?? []) {
      if (job.resumeFolderName) folders.add(job.resumeFolderName);
    }
    return [...folders];
  }

  function getMockCredentialsHint() {
    return {
      profiles: Object.keys(PROFILES),
      ownerPassword: 'owner123',
      bidderPassword: 'bidder123',
    };
  }

  return {
    signIn,
    signOut,
    getAuth,
    getDashboardState,
    getPoolsForProfile,
    findPool,
    findJob,
    markJobApplied,
    resetActiveJobs,
    getPoolDownloadEntries,
    getUniqueResumeFolders,
    getMockCredentialsHint,
  };
})();
