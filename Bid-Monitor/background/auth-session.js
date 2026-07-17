/**
 * Fast auth session — no Bid Ready queue load on sign-in.
 */
const AuthSession = (() => {
  const AUTH_KEY = 'auth';

  async function getAuth() {
    const { [AUTH_KEY]: auth = null } = await chrome.storage.local.get(AUTH_KEY);
    return auth;
  }

  async function signIn(_username, _password, options = {}) {
    const applierName = String(options.applierName || '').trim();
    const apiUrl = String(options.apiUrl || '').trim();
    const displayName =
      String(options.displayName || _username || applierName).trim() || applierName;

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

    return { ok: true, auth, pools: null, athensError: null, deferredQueue: true };
  }

  async function signOut() {
    await chrome.storage.local.remove(AUTH_KEY);
    return { ok: true };
  }

  return { AUTH_KEY, getAuth, signIn, signOut };
})();
