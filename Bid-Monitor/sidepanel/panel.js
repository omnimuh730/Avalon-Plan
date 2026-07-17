const loginView = document.getElementById('loginView');
const workspaceView = document.getElementById('workspaceView');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const applierNameInput = document.getElementById('applierName');
const apiUrlInput = document.getElementById('apiUrl');
const loginError = document.getElementById('loginError');
const profileNameEl = document.getElementById('profileName');
const roleBadgeEl = document.getElementById('roleBadge');
const bridgeBadgeEl = document.getElementById('bridgeBadge');
const completedTodayEl = document.getElementById('completedToday');
const signOutBtn = document.getElementById('signOutBtn');
const jobList = document.getElementById('jobList');
const refreshQueueBtn = document.getElementById('refreshQueueBtn');
const applySessionView = document.getElementById('applySessionView');
const applyJobCompany = document.getElementById('applyJobCompany');
const applyJobTitle = document.getElementById('applyJobTitle');
const applyResumeFolder = document.getElementById('applyResumeFolder');
const applySessionStatus = document.getElementById('applySessionStatus');
const applySessionError = document.getElementById('applySessionError');
const applyModeBadge = document.getElementById('applyModeBadge');
const startRecordBlock = document.getElementById('startRecordBlock');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const openJobBtn = document.getElementById('openJobBtn');
const screeningPanel = document.getElementById('screeningPanel');
const lightJd = document.getElementById('lightJd');
const lightRemote = document.getElementById('lightRemote');
const lightClearance = document.getElementById('lightClearance');
const analyzeStatus = document.getElementById('analyzeStatus');
const summaryDetails = document.getElementById('summaryDetails');
const analyzeSummary = document.getElementById('analyzeSummary');
const flagExplanations = document.getElementById('flagExplanations');
const formAnswersDetails = document.getElementById('formAnswersDetails');
const formAnswersCount = document.getElementById('formAnswersCount');
const formAnswersList = document.getElementById('formAnswersList');
const applyResumeActions = document.getElementById('applyResumeActions');
const applyViewResumeBtn = document.getElementById('applyViewResumeBtn');
const applyDownloadResumeBtn = document.getElementById('applyDownloadResumeBtn');
const finishFooter = document.getElementById('finishFooter');
const finishActions = document.getElementById('finishActions');
const finishHint = document.getElementById('finishHint');
const submitRecordingBtn = document.getElementById('submitRecordingBtn');
const skipRecordingBtn = document.getElementById('skipRecordingBtn');
const recordingsView = document.getElementById('recordingsView');
const recordingsList = document.getElementById('recordingsList');
const statusStrip = document.getElementById('statusStrip');
const statusStripText = document.getElementById('statusStripText');
const formatOptions = [...document.querySelectorAll('.format-option')];

let dashboardState = { auth: null, pools: [] };
let currentTabId = null;
let applyTabId = null;
let currentTabState = null;
let recordingSessions = [];
let analysisByTab = {};
let completedTodayCount = 0;
let applyResumeJobId = null;
let applyResumeCheckToken = 0;

async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
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

function setLight(el, status) {
  if (!el) return;
  el.classList.remove('green', 'red', 'unknown');
  if (status === 'green' || status === 'red') el.classList.add(status);
  else el.classList.add('unknown');
}

function renderAnalysis(tabId) {
  const data = tabId ? analysisByTab[tabId] : null;
  if (!data) {
    screeningPanel?.classList.add('hidden');
    setLight(lightJd, 'unknown');
    setLight(lightRemote, 'unknown');
    setLight(lightClearance, 'unknown');
    analyzeStatus?.classList.add('hidden');
    summaryDetails?.classList.add('hidden');
    if (flagExplanations) flagExplanations.innerHTML = '';
    formAnswersDetails?.classList.add('hidden');
    if (formAnswersList) formAnswersList.innerHTML = '';
    return;
  }

  screeningPanel?.classList.remove('hidden');
  setLight(lightJd, data.jdAnalyzed ? 'green' : 'unknown');
  setLight(lightRemote, data.flags?.remote?.status);
  setLight(lightClearance, data.flags?.clearance?.status);

  if (data.summary) {
    summaryDetails?.classList.remove('hidden');
    if (analyzeSummary) analyzeSummary.textContent = data.summary;
  } else {
    summaryDetails?.classList.add('hidden');
  }

  const reds = [];
  if (data.flags?.remote?.status === 'red') {
    reds.push(`Remote: ${data.flags.remote.explanation || 'Not remote-friendly'}`);
  }
  if (data.flags?.clearance?.status === 'red') {
    reds.push(`Clearance: ${data.flags.clearance.explanation || 'Clearance required'}`);
  }
  if (flagExplanations) {
    flagExplanations.innerHTML = reds.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  }

  const answers = Array.isArray(data.formAnswers) ? data.formAnswers : [];
  if (answers.length) {
    formAnswersDetails?.classList.remove('hidden');
    if (formAnswersCount) formAnswersCount.textContent = `(${answers.length})`;
    if (formAnswersList) {
      formAnswersList.innerHTML = answers
        .map((a) => {
          const conf = String(a.confidence || '').toLowerCase();
          const confClass = conf === 'high' || conf === 'medium' || conf === 'low' ? conf : '';
          const confBadge = confClass
            ? `<span class="answer-confidence ${confClass}">${escapeHtml(conf)}</span>`
            : '';
          return `<li class="answer-item">
            <div class="answer-q">${escapeHtml(a.question || '')}${confBadge}</div>
            <div class="answer-a">${escapeHtml(a.suggestedAnswer || '')}</div>
          </li>`;
        })
        .join('');
    }
  } else {
    formAnswersDetails?.classList.add('hidden');
    if (formAnswersList) formAnswersList.innerHTML = '';
  }

  if (analyzeStatus) {
    if (data.error) {
      analyzeStatus.textContent = data.error;
      analyzeStatus.classList.remove('hidden');
    } else {
      analyzeStatus.textContent = data.charCount
        ? `Analyzed ${data.charCount.toLocaleString()} chars from page`
        : 'Analysis complete';
      analyzeStatus.classList.remove('hidden');
    }
  }
}

async function refreshApplyResume(job) {
  const jobId = job?.athensJobId || job?.id || null;
  applyResumeJobId = jobId ? String(jobId) : null;

  if (!applyResumeJobId) {
    applyResumeActions?.classList.add('hidden');
    return;
  }

  // Optimistic show when we already know a résumé exists.
  if (job?.hasGeneratedResume) {
    applyResumeActions?.classList.remove('hidden');
  }

  const token = ++applyResumeCheckToken;
  try {
    const res = await sendMessage({ type: 'CHECK_JOB_RESUME', jobId: applyResumeJobId });
    if (token !== applyResumeCheckToken) return;
    if (res?.ok && res.hasResume) {
      applyResumeActions?.classList.remove('hidden');
    } else if (!job?.hasGeneratedResume) {
      applyResumeActions?.classList.add('hidden');
    }
  } catch {
    if (token === applyResumeCheckToken && !job?.hasGeneratedResume) {
      applyResumeActions?.classList.add('hidden');
    }
  }
}

function resolveFinishTabId() {
  return (
    applyTabId ||
    currentTabState?.tabId ||
    currentTabState?.session?.tabId ||
    currentTabId
  );
}

function renderApplySession(state) {
  const job = state?.applyJob;
  const isRec = Boolean(state?.isRecording);
  const hasPending = Boolean(job) && !isRec;
  const finishable = isRec || hasPending;
  const hasCard = Boolean(job) || isRec;

  applyTabId = state?.tabId ?? (isRec ? state?.session?.tabId : null) ?? null;
  applySessionView.classList.toggle('hidden', !hasCard);
  if (!hasCard) {
    finishFooter?.classList.add('hidden');
    statusStrip.className = 'status-strip idle';
    statusStripText.textContent = 'Select a Bid Ready job to apply';
    return;
  }

  applyJobCompany.textContent = job?.companyName ?? 'This tab';
  applyJobTitle.textContent = job?.title ?? '';
  applyResumeFolder.textContent = job?.resumeFolderName
    ? `Resume: ${job.resumeFolderName}`
    : '';

  refreshApplyResume(job);

  applySessionView.classList.toggle('recording', isRec);
  applyModeBadge.textContent = isRec ? 'Recording' : 'Ready';
  applyModeBadge.className = `mode-badge ${isRec ? 'recording' : 'ready'}`;

  if (isRec) {
    statusStrip.className = 'status-strip recording';
    statusStripText.textContent = 'Recording — Submit or Skip when done';
    applySessionStatus.textContent =
      'Video capture is active. Finish with Submit (uploaded) or Skip.';
    startRecordBlock?.classList.add('hidden');
    if (finishHint) {
      finishHint.textContent =
        'Stops recording. Submit → Submitted · Skip → Skipped.';
    }
  } else {
    statusStrip.className = 'status-strip ready';
    statusStripText.textContent = 'Ready — start recording, or Submit / Skip without video';
    applySessionStatus.textContent =
      'Job is In-Process. Start recording from the toolbar, or finish without video.';
    startRecordBlock?.classList.remove('hidden');
    if (finishHint) {
      finishHint.textContent =
        'Skip or Submit without recording also updates Bid Management. Prefer recording when possible.';
    }
  }

  applySessionError.classList.add('hidden');
  finishFooter?.classList.toggle('hidden', !finishable);
  if (submitRecordingBtn) {
    submitRecordingBtn.disabled = !finishable;
    submitRecordingBtn.textContent = isRec ? 'Submit' : 'Submit (no video)';
  }
  if (skipRecordingBtn) {
    skipRecordingBtn.disabled = !finishable;
    skipRecordingBtn.textContent = 'Skip this Job';
  }

  renderAnalysis(applyTabId || state?.tabId);
}

function renderRecordingsList() {
  const sessions = (recordingSessions ?? []).filter((s) => s.tabId);
  recordingsView.classList.toggle('hidden', sessions.length === 0);
  recordingsList.innerHTML = '';

  for (const session of sessions) {
    const li = document.createElement('li');
    const title = session.companyName
      ? `${session.companyName} — ${session.jobTitle ?? ''}`
      : session.startTitle || 'Recording';
    li.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <span class="meta-line">Recording…</span>
      <div class="item-actions">
        <button type="button" class="btn btn-primary" data-finish="submit" data-stop-tab="${session.tabId}">Submit</button>
        <button type="button" class="btn btn-muted" data-finish="skip" data-stop-tab="${session.tabId}">Skip</button>
      </div>
    `;
    recordingsList.appendChild(li);
  }

  recordingsList.querySelectorAll('[data-stop-tab]').forEach((button) => {
    button.addEventListener('click', () =>
      finishApply(Number(button.dataset.stopTab), button.dataset.finish || 'submit', button),
    );
  });
}

async function refreshApplySession() {
  currentTabId = await getCurrentTabId();
  // Prefer SW resolution of pending/recording tab — side panel focus can steal
  // activeTab away from the job page.
  const [state, fullState] = await Promise.all([
    sendMessage({ type: 'GET_ACTIVE_APPLY' }),
    sendMessage({ type: 'GET_STATE' }),
  ]);

  currentTabState = state?.ok ? state : null;
  recordingSessions = fullState?.ok ? (fullState.recordingSessions ?? []) : [];

  renderApplySession(currentTabState);
  renderRecordingsList();
}

function showRecordingInstructions() {
  alert(
    'Recording is silent (no screen-share dialog).\n\n'
      + '1. Focus the job application tab.\n'
      + '2. Click the Bid Monitor icon in the Chrome toolbar\n'
      + '   — or right-click → "Bid Monitor: Start / Stop recording this tab".\n\n'
      + 'Recording starts immediately. Use Submit or Skip in this panel to finish.',
  );
}

async function finishApply(tabId, finishAction = 'submit', button) {
  if (!tabId) {
    alert('No active job tab. Open a Bid Ready job with Apply first.');
    return;
  }
  const action = finishAction === 'skip' ? 'skip' : 'submit';

  if (button) {
    button.disabled = true;
    button.textContent = action === 'skip' ? 'Skipping…' : 'Submitting…';
  }
  statusStrip.className = 'status-strip finishing';
  statusStripText.textContent = action === 'skip' ? 'Skipping…' : 'Submitting…';
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
    alert(response?.error || 'Failed to finish job.');
    await refreshApplySession();
    return;
  }

  if (response.jobOutcome === 'submitted' || response.jobOutcome === 'skipped') {
    completedTodayCount += 1;
    updateCompletedPill();
    const todayKey = new Date().toISOString().slice(0, 10);
    await chrome.storage.local.set({
      bidMonitorCompletedDay: { dayKey: todayKey, count: completedTodayCount },
    });
  }

  if (response.uploadError || response.statusError) {
    alert(
      `Finished with a warning:\n${response.uploadError || response.statusError}`,
    );
  } else if (response.jobOutcome === 'skipped') {
    alert('Skipped. Ticket moved to Skipped in Bid Management.');
  } else if (response.jobOutcome === 'submitted') {
    alert(
      response.uploaded
        ? 'Submitted. Recording uploaded — ticket is Submitted.'
        : response.withoutRecording
          ? 'Submitted without video — ticket is Submitted.'
          : 'Submitted. Ticket is Submitted in Bid Management.',
    );
  }

  delete analysisByTab[tabId];
  await refreshApplySession();
  await loadDashboard();
}

function updateCompletedPill() {
  if (completedTodayEl) {
    completedTodayEl.textContent = `${completedTodayCount} today`;
  }
}

async function refreshBridgeBadge() {
  if (!bridgeBadgeEl) return;
  try {
    const res = await sendMessage({ type: 'CHECK_ATHENS' });
    if (res?.healthy) {
      bridgeBadgeEl.textContent = 'Athens OK';
      bridgeBadgeEl.className = 'bridge-badge ok';
      bridgeBadgeEl.title = res.apiUrl || '';
    } else {
      bridgeBadgeEl.textContent = 'Athens down';
      bridgeBadgeEl.className = 'bridge-badge down';
      bridgeBadgeEl.title = res?.error || 'Start Athens-server on :8979';
    }
  } catch {
    bridgeBadgeEl.textContent = 'Athens ?';
    bridgeBadgeEl.className = 'bridge-badge unknown';
  }
}

function getOpenJobs() {
  const pools = dashboardState.pools ?? [];
  const jobs = [];
  for (const pool of pools) {
    for (const job of pool.jobs ?? []) {
      if (job.status === 'applied' || job.status === 'skipped') continue;
      jobs.push({ ...job, poolId: pool.id });
    }
  }
  return jobs;
}

function renderQueue() {
  jobList.innerHTML = '';
  if (dashboardState.athensError) {
    const errLi = document.createElement('li');
    errLi.className = 'empty';
    errLi.textContent = `Athens: ${dashboardState.athensError}`;
    jobList.appendChild(errLi);
  }

  const jobs = getOpenJobs();
  if (!jobs.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent =
      'No Bid Ready jobs. Mark jobs Bid ready in Athens Job Search.';
    jobList.appendChild(empty);
    return;
  }

  for (const job of jobs) {
    const li = document.createElement('li');
    const statusClass =
      job.status === 'in_process' ? 'status-active' : 'status-open';
    const statusLabel = job.status === 'in_process' ? 'In process' : 'Pending';
    const resumeJobId = job.athensJobId || job.id;
    const resumeActions = job.hasGeneratedResume
      ? `
        <button type="button" class="btn btn-secondary" data-view-resume="${escapeHtml(resumeJobId)}">View résumé</button>
        <button type="button" class="btn btn-secondary" data-download-resume="${escapeHtml(resumeJobId)}">Download</button>
      `
      : '';

    li.innerHTML = `
      <strong>${escapeHtml(job.companyName)}</strong>
      <span class="meta-line">${escapeHtml(job.title)}</span>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="item-actions">
        ${resumeActions}
        <button type="button" class="btn btn-apply" data-apply-job="${job.id}" data-pool="${job.poolId}">Apply</button>
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
      const poolId = button.dataset.pool;
      const pool = (dashboardState.pools ?? []).find((p) => p.id === poolId);
      const job = pool?.jobs?.find((item) => item.id === jobId);
      if (!job || !pool) return;

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
        })
          .then(async (response) => {
            if (!response?.ok) {
              alert(response?.error || 'Failed to open job application.');
              button.disabled = false;
              button.textContent = 'Apply';
              return;
            }
            button.disabled = false;
            button.textContent = 'Apply';
            await refreshApplySession();
            applySessionView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            startRecordingBtn?.classList.add('pulse');
            setTimeout(() => startRecordingBtn?.classList.remove('pulse'), 2000);
          })
          .catch((err) => {
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
    loginView.classList.remove('hidden');
    workspaceView.classList.add('hidden');
    return;
  }

  loginView.classList.add('hidden');
  workspaceView.classList.remove('hidden');
  profileNameEl.textContent = auth.displayName;
  roleBadgeEl.textContent = auth.role;
  roleBadgeEl.className = `role-badge ${auth.role}`;
  renderQueue();
  refreshApplySession().catch(() => {});
  refreshBridgeBadge().catch(() => {});
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

async function runAnalyze() {
  const tabId = resolveFinishTabId() || currentTabId;
  const job = currentTabState?.applyJob;
  if (!tabId) {
    alert('Open a job tab first.');
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing…';
  screeningPanel?.classList.remove('hidden');
  if (analyzeStatus) {
    analyzeStatus.textContent = 'Reading page…';
    analyzeStatus.classList.remove('hidden');
  }

  try {
    const response = await sendMessage({
      type: 'ANALYZE_JOB_TAB',
      tabId,
      jobId: job?.id || job?.athensJobId,
      companyName: job?.companyName,
      jobTitle: job?.title,
      applyUrl: job?.jdUrl,
    });

    if (!response?.ok) {
      analysisByTab[tabId] = {
        jdAnalyzed: false,
        flags: { remote: null, clearance: null },
        error: response?.error || 'Analyze failed',
      };
      renderAnalysis(tabId);
      alert(response?.error || 'Analyze failed. Is Athens-server running?');
      return;
    }

    analysisByTab[tabId] = {
      jdAnalyzed: response.jdAnalyzed,
      flags: response.flags || { remote: null, clearance: null },
      summary: response.summary,
      formAnswers: response.formAnswers || response.page?.formAnswers || [],
      charCount: response.charCount,
      error:
        response.mode === 'heuristic'
          ? 'Analyzed with local heuristics (no LLM key or LLM unavailable)'
          : response.flagsError || response.pageError || null,
    };
    renderAnalysis(tabId);
  } catch (err) {
    alert(err.message || 'Analyze failed.');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze';
  }
}

startRecordingBtn?.addEventListener('click', () => {
  showRecordingInstructions();
});

analyzeBtn?.addEventListener('click', () => {
  runAnalyze().catch((err) => alert(err?.message || 'Analyze failed.'));
});

openJobBtn?.addEventListener('click', () => {
  const url = currentTabState?.applyJob?.jdUrl;
  if (url) chrome.tabs.create({ url, active: true });
});

applyViewResumeBtn?.addEventListener('click', async () => {
  if (!applyResumeJobId) return;
  applyViewResumeBtn.disabled = true;
  try {
    const res = await sendMessage({ type: 'OPEN_JOB_RESUME', jobId: applyResumeJobId });
    if (!res?.ok) alert(res?.error || 'Failed to open résumé.');
  } catch (err) {
    alert(err?.message || 'Failed to open résumé.');
  } finally {
    applyViewResumeBtn.disabled = false;
  }
});

applyDownloadResumeBtn?.addEventListener('click', async () => {
  if (!applyResumeJobId) return;
  applyDownloadResumeBtn.disabled = true;
  const prev = applyDownloadResumeBtn.textContent;
  applyDownloadResumeBtn.textContent = 'Downloading…';
  try {
    const res = await sendMessage({ type: 'DOWNLOAD_JOB_RESUME', jobId: applyResumeJobId });
    if (!res?.ok) alert(res?.error || 'Failed to download résumé.');
  } catch (err) {
    alert(err?.message || 'Failed to download résumé.');
  } finally {
    applyDownloadResumeBtn.disabled = false;
    applyDownloadResumeBtn.textContent = prev;
  }
});

submitRecordingBtn?.addEventListener('click', () => {
  finishApply(resolveFinishTabId(), 'submit').catch((err) =>
    alert(err?.message || 'Failed to submit.'),
  );
});

skipRecordingBtn?.addEventListener('click', () => {
  finishApply(resolveFinishTabId(), 'skip').catch((err) =>
    alert(err?.message || 'Failed to skip.'),
  );
});

refreshQueueBtn?.addEventListener('click', () => {
  loadDashboard().catch(() => {});
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
    password: passwordInput?.value || 'bidder123',
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
  dashboardState = { auth: null, pools: [] };
  renderDashboard();
});

formatOptions.forEach((button) => {
  button.addEventListener('click', () => {
    setSelectedVideoFormat(button.dataset.format);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.jobPools || changes.pendingApplyTabs || changes.bidMonitorSessions) {
    loadDashboard().catch(() => {});
    refreshApplySession().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'APPLY_SESSION_UPDATED') {
    refreshApplySession().catch(() => {});
    return;
  }

  if (message.type === 'PANEL_HIGHLIGHT_START' || message.type === 'PANEL_HIGHLIGHT_FINISH') {
    refreshApplySession()
      .then(() => {
        applySessionView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        finishFooter?.classList.remove('hidden');
        submitRecordingBtn?.classList.add('pulse');
        setTimeout(() => submitRecordingBtn?.classList.remove('pulse'), 2000);
      })
      .catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(() => {
  refreshApplySession().catch(() => {});
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshApplySession().catch(() => {});
});

(async function init() {
  const {
    videoFormat = 'webm',
    athensSettings,
    bidMonitorCompletedDay,
  } = await chrome.storage.local.get([
    'videoFormat',
    'athensSettings',
    'bidMonitorCompletedDay',
  ]);
  setSelectedVideoFormat(videoFormat);

  const todayKey = new Date().toISOString().slice(0, 10);
  if (bidMonitorCompletedDay?.dayKey === todayKey) {
    completedTodayCount = Number(bidMonitorCompletedDay.count) || 0;
  } else {
    completedTodayCount = 0;
    await chrome.storage.local.set({
      bidMonitorCompletedDay: { dayKey: todayKey, count: 0 },
    });
  }
  updateCompletedPill();

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
  setInterval(() => refreshBridgeBadge().catch(() => {}), 15000);
})();
