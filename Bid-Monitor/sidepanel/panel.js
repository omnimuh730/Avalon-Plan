const loginView = document.getElementById('loginView');
const poolsView = document.getElementById('poolsView');
const jobsView = document.getElementById('jobsView');
const applySessionView = document.getElementById('applySessionView');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');
const profileNameEl = document.getElementById('profileName');
const roleBadgeEl = document.getElementById('roleBadge');
const signOutBtn = document.getElementById('signOutBtn');
const poolList = document.getElementById('poolList');
const jobList = document.getElementById('jobList');
const jobsPoolTitle = document.getElementById('jobsPoolTitle');
const jobsPoolStatus = document.getElementById('jobsPoolStatus');
const backToPoolsBtn = document.getElementById('backToPoolsBtn');
const applyJobCompany = document.getElementById('applyJobCompany');
const applyJobTitle = document.getElementById('applyJobTitle');
const applyResumeFolder = document.getElementById('applyResumeFolder');
const applySessionStatus = document.getElementById('applySessionStatus');
const applySessionError = document.getElementById('applySessionError');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recordingsView = document.getElementById('recordingsView');
const recordingsList = document.getElementById('recordingsList');
const formatOptions = [...document.querySelectorAll('.format-option')];

let dashboardState = { auth: null, pools: [] };
let selectedPoolId = null;
let currentTabId = null;
let currentTabState = null;
let recordingSessions = [];

async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

async function getCurrentTabId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

function showView(viewName) {
  loginView.classList.toggle('hidden', viewName !== 'login');
  poolsView.classList.toggle('hidden', viewName !== 'pools');
  jobsView.classList.toggle('hidden', viewName !== 'jobs');
}

function showLoginError(message) {
  if (!message) {
    loginError.classList.add('hidden');
    loginError.textContent = '';
    return;
  }
  loginError.textContent = message;
  loginError.classList.remove('hidden');
}

function getSelectedVideoFormat() {
  const active = formatOptions.find((button) => button.classList.contains('active'));
  return active?.dataset.format === 'mp4' ? 'mp4' : 'webm';
}

function setSelectedVideoFormat(format) {
  const normalized = format === 'mp4' ? 'mp4' : 'webm';
  for (const button of formatOptions) {
    button.classList.toggle('active', button.dataset.format === normalized);
  }
  chrome.storage.local.set({ videoFormat: normalized });
}

function renderApplySession(state) {
  const job = state?.applyJob;
  const isRec = Boolean(state?.isRecording);
  const hasCard = Boolean(job) || isRec;

  applySessionView.classList.toggle('hidden', !hasCard);
  if (!hasCard) return;

  applyJobCompany.textContent = job?.companyName ?? 'This tab';
  applyJobTitle.textContent = job?.title ?? '';
  applyResumeFolder.textContent = job?.resumeFolderName ? `Resume: ${job.resumeFolderName}` : '';

  applySessionView.classList.toggle('recording', isRec);

  if (isRec) {
    applySessionStatus.textContent = 'Recording this tab…';
    applySessionError.classList.add('hidden');
    startRecordingBtn.classList.add('hidden');
    stopRecordingBtn.classList.remove('hidden');
    stopRecordingBtn.disabled = false;
    stopRecordingBtn.textContent = 'Stop & Finish Apply';
  } else {
    applySessionStatus.textContent = 'To record silently: click the Bid Monitor toolbar icon while viewing this tab (or right-click the page \u2192 Bid Monitor: Start / Stop recording).';
    applySessionError.classList.add('hidden');
    startRecordingBtn.classList.remove('hidden');
    startRecordingBtn.disabled = false;
    startRecordingBtn.textContent = 'How to start recording';
    stopRecordingBtn.classList.add('hidden');
  }
}

function renderRecordingsList() {
  const sessions = (recordingSessions ?? []).filter((s) => s.tabId);
  recordingsView.classList.toggle('hidden', sessions.length === 0);
  recordingsList.innerHTML = '';

  for (const session of sessions) {
    const li = document.createElement('li');
    const title = session.companyName
      ? `${session.companyName} — ${session.jobTitle ?? ''}`
      : (session.startTitle || 'Recording');
    li.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <span class="meta-line">Recording…</span>
      <div class="item-actions">
        <button type="button" class="btn btn-stop" data-stop-tab="${session.tabId}">Stop</button>
      </div>
    `;
    recordingsList.appendChild(li);
  }

  recordingsList.querySelectorAll('[data-stop-tab]').forEach((button) => {
    button.addEventListener('click', () => stopRecordingForTab(Number(button.dataset.stopTab), button));
  });
}

async function refreshApplySession() {
  currentTabId = await getCurrentTabId();
  const [state, fullState] = await Promise.all([
    currentTabId
      ? sendMessage({ type: 'GET_ACTIVE_APPLY', tabId: currentTabId })
      : Promise.resolve(null),
    sendMessage({ type: 'GET_STATE' }),
  ]);

  currentTabState = state?.ok ? state : null;
  recordingSessions = fullState?.ok ? (fullState.recordingSessions ?? []) : [];

  renderApplySession(currentTabState);
  renderRecordingsList();
}

function showRecordingInstructions() {
  alert(
    'Recording is silent (no screen-share dialog). To start it, Chrome needs a '
    + 'direct click on the extension:\n\n'
    + '1. Open/switch to the job application tab.\n'
    + '2. Click the Bid Monitor icon in the Chrome toolbar (top-right)\n'
    + '   \u2014 or right-click the page \u2192 "Bid Monitor: Start / Stop recording this tab".\n\n'
    + 'Recording starts immediately with no picker. Repeat on other tabs to record several at once.',
  );
}

async function stopRecordingForTab(tabId, button) {
  if (!tabId) return;

  if (button) {
    button.disabled = true;
    button.textContent = 'Stopping…';
  }
  stopRecordingBtn.disabled = true;
  stopRecordingBtn.textContent = 'Stopping…';

  const response = await sendMessage({
    type: 'STOP_CAPTURE',
    tabId,
    closeApplyTab: true,
  });

  stopRecordingBtn.disabled = false;
  stopRecordingBtn.textContent = 'Stop & Finish Apply';

  if (!response?.ok) {
    alert(response?.error || 'Failed to stop recording.');
    await refreshApplySession();
    return;
  }

  await refreshApplySession();
  await loadDashboard();
}

function renderPools() {
  poolList.innerHTML = '';
  const pools = dashboardState.pools ?? [];

  if (!pools.length) {
    poolList.innerHTML = '<li class="empty">No job pools available.</li>';
    return;
  }

  for (const pool of pools) {
    const li = document.createElement('li');
    const statusClass = pool.status === 'active' ? 'status-active' : 'status-done';
    const appliedCount = pool.jobs.filter((job) => job.status === 'applied').length;
    li.innerHTML = `
      <strong>${pool.name}</strong>
      <span class="meta-line">${pool.jobs.length} jobs · ${appliedCount} applied</span>
      <span class="status-badge ${statusClass}">${pool.status}</span>
      <div class="item-actions">
        <button type="button" class="btn btn-secondary" data-open-pool="${pool.id}">View Jobs</button>
        ${dashboardState.auth?.role === 'owner'
          ? `<button type="button" class="btn btn-secondary" data-download-pool="${pool.id}">Download ZIP</button>`
          : ''}
      </div>
    `;
    poolList.appendChild(li);
  }

  poolList.querySelectorAll('[data-open-pool]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPoolId = button.dataset.openPool;
      renderJobs(selectedPoolId);
      showView('jobs');
    });
  });

  poolList.querySelectorAll('[data-download-pool]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await sendMessage({ type: 'DOWNLOAD_POOL', poolId: button.dataset.downloadPool });
      } catch (err) {
        alert(err.message || 'Download failed.');
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderJobs(poolId) {
  const pool = dashboardState.pools.find((item) => item.id === poolId);
  if (!pool) return;

  jobsPoolTitle.textContent = pool.name;
  jobsPoolStatus.textContent = pool.status;
  jobsPoolStatus.className = `status-badge ${pool.status === 'active' ? 'status-active' : 'status-done'}`;

  jobList.innerHTML = '';
  const isBidder = dashboardState.auth?.role === 'bidder';
  const openJobs = pool.jobs.filter((job) => job.status !== 'applied');

  if (!pool.jobs.length) {
    jobList.innerHTML = '<li class="empty">No jobs in this pool.</li>';
    return;
  }

  if (isBidder && !openJobs.length) {
    jobList.innerHTML = `
      <li class="empty">
        All jobs in this pool are marked Applied.
        <button type="button" class="btn btn-secondary" id="resetDemoJobsBtn" style="margin-top:8px">Reset demo jobs</button>
      </li>
    `;
    document.getElementById('resetDemoJobsBtn')?.addEventListener('click', async () => {
      const response = await sendMessage({ type: 'RESET_ACTIVE_JOBS' });
      if (response?.ok) {
        await loadDashboard();
        renderJobs(poolId);
      } else {
        alert(response?.error || 'Failed to reset jobs.');
      }
    });
    return;
  }

  for (const job of pool.jobs) {
    const li = document.createElement('li');
    const statusClass = job.status === 'applied' ? 'status-applied' : 'status-open';
    const statusLabel = job.status === 'applied' ? 'Applied' : 'Not applied';

    li.innerHTML = `
      <strong>${job.companyName}</strong>
      <span class="meta-line">${job.title}</span>
      <a class="jd-link meta-line" href="${job.jdUrl}" target="_blank" rel="noopener noreferrer">${job.jdUrl}</a>
      <span class="meta-line">Resume folder: <strong>${job.resumeFolderName}</strong></span>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="item-actions">
        ${isBidder && job.status !== 'applied'
          ? `<button type="button" class="btn btn-apply" data-apply-job="${job.id}">Apply</button>`
          : ''}
      </div>
    `;

    jobList.appendChild(li);
  }

  jobList.querySelectorAll('[data-apply-job]').forEach((button) => {
    button.addEventListener('click', () => {
      const jobId = button.dataset.applyJob;
      const job = pool.jobs.find((item) => item.id === jobId);
      if (!job) return;

      button.disabled = true;
      button.textContent = 'Opening…';

      chrome.tabs.create({ url: job.jdUrl, active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab?.id) {
          alert(chrome.runtime.lastError?.message || 'Failed to open job tab.');
          button.disabled = false;
          button.textContent = 'Apply';
          return;
        }

        sendMessage({
          type: 'APPLY_OPEN_JOB',
          tabId: tab.id,
          poolId: pool.id,
          jobId: job.id,
        }).then(async (response) => {
          if (!response?.ok) {
            alert(response?.error || 'Failed to open job application.');
            button.disabled = false;
            button.textContent = 'Apply';
            return;
          }

          button.disabled = false;
          button.textContent = 'Apply';
          alert('Job tab opened. On that tab, click the Bid Monitor toolbar icon (or right-click \u2192 Bid Monitor: Start / Stop recording) to start recording silently.');
          await refreshApplySession();
        }).catch((err) => {
          alert(err.message || 'Failed to open job application.');
          button.disabled = false;
          button.textContent = 'Apply';
        });
      });
    });
  });
}

function renderDashboard() {
  const auth = dashboardState.auth;
  if (!auth) {
    applySessionView.classList.add('hidden');
    showView('login');
    return;
  }

  profileNameEl.textContent = auth.displayName;
  roleBadgeEl.textContent = auth.role;
  roleBadgeEl.className = `role-badge ${auth.role}`;
  renderPools();

  if (selectedPoolId) {
    renderJobs(selectedPoolId);
    showView('jobs');
  } else {
    showView('pools');
  }

  refreshApplySession().catch(() => {});
}

async function loadDashboard() {
  const response = await sendMessage({ type: 'GET_DASHBOARD' });
  if (response?.auth) {
    dashboardState = response;
    renderDashboard();
    return;
  }
  dashboardState = { auth: null, pools: [] };
  renderDashboard();
}

startRecordingBtn.addEventListener('click', () => {
  showRecordingInstructions();
});

stopRecordingBtn.addEventListener('click', () => {
  stopRecordingForTab(currentTabId).catch((err) => alert(err?.message || 'Failed to stop recording.'));
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginError('');

  const response = await sendMessage({
    type: 'SIGN_IN',
    username: usernameInput.value,
    password: passwordInput.value,
  });

  if (!response?.ok) {
    showLoginError(response?.error || 'Sign in failed.');
    return;
  }

  usernameInput.value = '';
  passwordInput.value = '';
  await loadDashboard();
});

signOutBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'SIGN_OUT' });
  selectedPoolId = null;
  dashboardState = { auth: null, pools: [] };
  renderDashboard();
});

backToPoolsBtn.addEventListener('click', () => {
  selectedPoolId = null;
  showView('pools');
});

formatOptions.forEach((button) => {
  button.addEventListener('click', () => {
    setSelectedVideoFormat(button.dataset.format);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.jobPools) {
    // A job was marked Applied (or reset) — refresh the jobs/pools list.
    loadDashboard().catch(() => {});
  }
  if (changes.pendingApplyTabs || changes.bidMonitorSessions) {
    refreshApplySession().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'APPLY_SESSION_UPDATED') {
    loadDashboard().catch(() => {});
    return;
  }

  if (message.type === 'PANEL_HIGHLIGHT_START') {
    refreshApplySession().then(() => {
      applySessionView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      startRecordingBtn.classList.add('pulse');
      setTimeout(() => startRecordingBtn.classList.remove('pulse'), 2000);
    }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(() => {
  refreshApplySession().catch(() => {});
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshApplySession().catch(() => {});
});

(async function init() {
  const { videoFormat = 'webm' } = await chrome.storage.local.get('videoFormat');
  setSelectedVideoFormat(videoFormat);
  await loadDashboard();
  setInterval(() => refreshApplySession().catch(() => {}), 2000);
})();
