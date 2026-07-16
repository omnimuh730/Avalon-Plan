const loginView = document.getElementById('loginView');
const poolsView = document.getElementById('poolsView');
const jobsView = document.getElementById('jobsView');
const applySessionView = document.getElementById('applySessionView');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const applierNameInput = document.getElementById('applierName');
const apiUrlInput = document.getElementById('apiUrl');
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
const finishActions = document.getElementById('finishActions');
const finishHint = document.getElementById('finishHint');
const submitRecordingBtn = document.getElementById('submitRecordingBtn');
const skipRecordingBtn = document.getElementById('skipRecordingBtn');
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
    applySessionStatus.textContent = 'Recording this tab… pick Submit or Skip when done.';
    applySessionError.classList.add('hidden');
    startRecordingBtn.classList.add('hidden');
    finishActions?.classList.remove('hidden');
    finishHint?.classList.remove('hidden');
    if (submitRecordingBtn) {
      submitRecordingBtn.disabled = false;
      submitRecordingBtn.textContent = 'Submit';
    }
    if (skipRecordingBtn) {
      skipRecordingBtn.disabled = false;
      skipRecordingBtn.textContent = 'Skip this Job';
    }
  } else {
    applySessionStatus.textContent = 'To record silently: click the Bid Monitor toolbar icon while viewing this tab (or right-click the page \u2192 Bid Monitor: Start / Stop recording).';
    applySessionError.classList.add('hidden');
    startRecordingBtn.classList.remove('hidden');
    startRecordingBtn.disabled = false;
    startRecordingBtn.textContent = 'How to start recording';
    finishActions?.classList.add('hidden');
    finishHint?.classList.add('hidden');
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
        <button type="button" class="btn btn-start" data-finish="submit" data-stop-tab="${session.tabId}">Submit</button>
        <button type="button" class="btn btn-stop" data-finish="skip" data-stop-tab="${session.tabId}">Skip</button>
      </div>
    `;
    recordingsList.appendChild(li);
  }

  recordingsList.querySelectorAll('[data-stop-tab]').forEach((button) => {
    button.addEventListener('click', () =>
      stopRecordingForTab(Number(button.dataset.stopTab), button.dataset.finish || 'submit', button),
    );
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

async function stopRecordingForTab(tabId, finishAction = 'submit', button) {
  if (!tabId) return;
  const action = finishAction === 'skip' ? 'skip' : 'submit';

  if (button) {
    button.disabled = true;
    button.textContent = action === 'skip' ? 'Skipping…' : 'Submitting…';
  }
  if (submitRecordingBtn) submitRecordingBtn.disabled = true;
  if (skipRecordingBtn) skipRecordingBtn.disabled = true;

  const response = await sendMessage({
    type: 'STOP_CAPTURE',
    tabId,
    closeApplyTab: true,
    finishAction: action,
  });

  if (submitRecordingBtn) {
    submitRecordingBtn.disabled = false;
    submitRecordingBtn.textContent = 'Submit';
  }
  if (skipRecordingBtn) {
    skipRecordingBtn.disabled = false;
    skipRecordingBtn.textContent = 'Skip this Job';
  }

  if (!response?.ok) {
    alert(response?.error || 'Failed to stop recording.');
    await refreshApplySession();
    return;
  }

  if (response.uploadError || response.statusError) {
    alert(
      `Recording stopped, but Athens update failed:\n${response.uploadError || response.statusError}`,
    );
  } else if (response.jobOutcome === 'skipped') {
    alert('Skipped. Ticket moved to Skipped in Bid Management.');
  } else if (response.jobOutcome === 'submitted') {
    alert(
      response.uploaded
        ? 'Submitted. Recording uploaded — ticket is Submitted in Bid Management.'
        : 'Submitted. Ticket is Submitted in Bid Management.',
    );
  }

  await refreshApplySession();
  await loadDashboard();
}

function renderPools() {
  poolList.innerHTML = '';
  const pools = dashboardState.pools ?? [];

  if (dashboardState.athensError) {
    const errLi = document.createElement('li');
    errLi.className = 'empty';
    errLi.textContent = `Athens: ${dashboardState.athensError}`;
    poolList.appendChild(errLi);
  }

  if (!pools.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No Bid Ready jobs. Mark jobs Bid ready in Athens Job Search.';
    poolList.appendChild(empty);
    return;
  }

  for (const pool of pools) {
    const li = document.createElement('li');
    const statusClass = pool.status === 'active' ? 'status-active' : 'status-done';
    const appliedCount = pool.jobs.filter((job) => job.status === 'applied').length;
    const openCount = pool.jobs.filter((job) => job.status !== 'applied').length;
    li.innerHTML = `
      <strong>${pool.name}</strong>
      <span class="meta-line">${openCount} open · ${appliedCount} submitted · ${pool.jobs.length} total</span>
      <span class="status-badge ${statusClass}">${pool.source === 'athens' ? 'athens' : pool.status}</span>
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
    jobList.innerHTML =
      '<li class="empty">No Bid Ready jobs for this applier. Mark jobs as Bid ready in Athens Job Search.</li>';
    return;
  }

  if (isBidder && !openJobs.length) {
    jobList.innerHTML = `
      <li class="empty">
        All Bid Ready jobs are submitted.
      </li>
    `;
    return;
  }

  for (const job of pool.jobs) {
    const li = document.createElement('li');
    const statusClass =
      job.status === 'applied'
        ? 'status-applied'
        : job.status === 'in_process'
          ? 'status-active'
          : 'status-open';
    const statusLabel =
      job.status === 'applied'
        ? 'Submitted'
        : job.status === 'in_process'
          ? 'In process'
          : 'Pending';

    const resumeJobId = job.athensJobId || job.id;
    const resumeActions = job.hasGeneratedResume
      ? `
        <button type="button" class="btn btn-secondary" data-view-resume="${escapeHtml(resumeJobId)}">View résumé</button>
        <button type="button" class="btn btn-secondary" data-download-resume="${escapeHtml(resumeJobId)}">Download</button>
      `
      : '<span class="meta-line">No generated résumé yet</span>';

    li.innerHTML = `
      <strong>${escapeHtml(job.companyName)}</strong>
      <span class="meta-line">${escapeHtml(job.title)}</span>
      <a class="jd-link meta-line" href="${job.jdUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.jdUrl)}</a>
      <span class="meta-line">Resume folder: <strong>${escapeHtml(job.resumeFolderName)}</strong></span>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="item-actions">
        ${resumeActions}
        ${isBidder && job.status !== 'applied'
          ? `<button type="button" class="btn btn-apply" data-apply-job="${job.id}">Apply</button>`
          : ''}
      </div>
    `;

    jobList.appendChild(li);
  }

  jobList.querySelectorAll('[data-view-resume]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await sendMessage({
          type: 'OPEN_JOB_RESUME',
          jobId: button.dataset.viewResume,
        });
        if (!response?.ok) alert(response?.error || 'Failed to open résumé.');
      } catch (err) {
        alert(err.message || 'Failed to open résumé.');
      } finally {
        button.disabled = false;
      }
    });
  });

  jobList.querySelectorAll('[data-download-resume]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const prev = button.textContent;
      button.textContent = 'Downloading…';
      try {
        const response = await sendMessage({
          type: 'DOWNLOAD_JOB_RESUME',
          jobId: button.dataset.downloadResume,
        });
        if (!response?.ok) alert(response?.error || 'Failed to download résumé.');
      } catch (err) {
        alert(err.message || 'Failed to download résumé.');
      } finally {
        button.disabled = false;
        button.textContent = prev;
      }
    });
  });

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

submitRecordingBtn?.addEventListener('click', () => {
  stopRecordingForTab(currentTabId, 'submit').catch((err) =>
    alert(err?.message || 'Failed to submit.'),
  );
});

skipRecordingBtn?.addEventListener('click', () => {
  stopRecordingForTab(currentTabId, 'skip').catch((err) =>
    alert(err?.message || 'Failed to skip.'),
  );
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginError('');

  const applierName = applierNameInput?.value?.trim() || '';
  const apiUrl = apiUrlInput?.value?.trim() || 'http://127.0.0.1:8979/api';
  const username = usernameInput.value.trim() || applierName;

  const response = await sendMessage({
    type: 'SIGN_IN',
    username,
    password: passwordInput.value || 'bidder123',
    applierName,
    apiUrl,
  });

  if (!response?.ok) {
    showLoginError(response?.error || 'Sign in failed.');
    return;
  }

  if (response.athensError) {
    showLoginError(`Signed in, but Athens queue failed: ${response.athensError}`);
  }

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
  const { videoFormat = 'webm', athensSettings } = await chrome.storage.local.get([
    'videoFormat',
    'athensSettings',
  ]);
  setSelectedVideoFormat(videoFormat);
  if (applierNameInput && athensSettings?.applierName) {
    applierNameInput.value = athensSettings.applierName;
  }
  if (apiUrlInput && athensSettings?.apiUrl) {
    apiUrlInput.value = athensSettings.apiUrl;
  }
  if (usernameInput && athensSettings?.applierName && !usernameInput.value) {
    usernameInput.value = athensSettings.applierName;
  }
  await loadDashboard();
  setInterval(() => refreshApplySession().catch(() => {}), 2000);
})();
