/**
 * Athens Bid Ready API client for Bid-Monitor.
 * Loads the live vendor/tasks queue and uploads recordings.
 */
const AthensApi = (() => {
  const SETTINGS_KEY = 'athensSettings';
  const DEFAULT_API_URL = 'http://127.0.0.1:8979/api';
  const QUEUE_TIMEOUT_MS = 15000;
  const UPLOAD_TIMEOUT_MS = 120000;
  const ANALYZE_TIMEOUT_MS = 300000;

  async function getSettings() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    return {
      apiUrl: String(settings.apiUrl || DEFAULT_API_URL).replace(/\/$/, ''),
      applierName: String(settings.applierName || '').trim(),
    };
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const next = {
      apiUrl: String(partial.apiUrl ?? current.apiUrl).replace(/\/$/, '') || DEFAULT_API_URL,
      applierName: String(partial.applierName ?? current.applierName).trim(),
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  async function fetchJson(path, { method = 'GET', body, apiUrl, timeoutMs } = {}) {
    const settings = await getSettings();
    const base = (apiUrl || settings.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
    const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs ?? QUEUE_TIMEOUT_MS),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || `Athens request failed (${response.status})`);
    }
    return data;
  }

  function mapTaskToJob(task, applierName) {
    // Align with Athens Bid Management (bidResultsController.mapTaskToBidResult):
    // In process ONLY after Bid Monitor Apply sets bidderInProcess.
    // Do NOT use progress === 'active' (Avalon session URL match).
    let status = 'pending';
    if (task.status === 'skipped' || task.progress === 'skipped') status = 'skipped';
    else if (task.progress === 'completed' || task.status === 'done') status = 'applied';
    else if (task.bidderInProcess) status = 'in_process';

    return {
      id: String(task.jobId || task.id),
      taskId: String(task.id),
      companyName: task.company || 'Unknown company',
      title: task.title || 'Untitled role',
      jdUrl: task.applyUrl || '',
      resumeFolderName: applierName.replace(/\s+/g, '') || 'Resume',
      status,
      sessionId: task.recording?.sessionId || task.sessionMatch?.sessionId || null,
      appliedAt: task.completedAt || null,
      athensJobId: task.jobId ? String(task.jobId) : null,
      matchScore: task.matchScore ?? null,
      source: task.source || '',
      hasRecording: Boolean(task.recording?.storagePath),
      hasGeneratedResume: false,
      bidderInProcess: Boolean(task.bidderInProcess),
    };
  }

  async function fetchBidReadyPools(applierName, apiUrl, options = {}) {
    const name = String(applierName || '').trim();
    if (!name) throw new Error('Athens applier name is required.');

    const data = await fetchJson(`/vendor/tasks?applierName=${encodeURIComponent(name)}`, {
      apiUrl,
      timeoutMs: options.timeoutMs ?? QUEUE_TIMEOUT_MS,
    });
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    // Open Bid Ready queue only — Submitted / Skipped leave the monitor list.
    const open = tasks.filter(
      (t) =>
        t.status !== 'skipped' &&
        t.status !== 'done' &&
        t.progress !== 'completed' &&
        t.progress !== 'skipped',
    );
    const jobs = open.map((t) => mapTaskToJob(t, name));

    if (options.includeResumeStatus) {
      const resumeJobIds = [
        ...new Set(jobs.map((j) => j.athensJobId || j.id).filter(Boolean)),
      ];
      let withResume = new Set();
      if (resumeJobIds.length) {
        try {
          withResume = await checkGeneratedResumes(name, resumeJobIds, {
            timeoutMs: options.timeoutMs ?? QUEUE_TIMEOUT_MS,
          });
        } catch (err) {
          console.warn('Bid Monitor: résumé status check failed', err);
        }
      }
      for (const job of jobs) {
        const rid = String(job.athensJobId || job.id);
        job.hasGeneratedResume = withResume.has(rid);
      }
    }

    return [
      {
        id: 'athens-bid-ready',
        name: 'Bid Ready',
        status: 'active',
        profileName: name,
        source: 'athens',
        jobs,
      },
    ];
  }

  async function startBid(applierName, { jobId, sessionId, bidderName, applyUrl }) {
    return fetchJson('/bid-results/start', {
      method: 'POST',
      body: {
        applierName,
        jobId,
        sessionId: sessionId || undefined,
        bidderName: bidderName || undefined,
        applyUrl: applyUrl || undefined,
      },
      timeoutMs: QUEUE_TIMEOUT_MS,
    });
  }

  async function uploadRecording(applierName, payload) {
    return fetchJson('/bid-recordings/upload', {
      method: 'POST',
      body: {
        applierName,
        jobId: payload.jobId,
        sessionId: payload.sessionId,
        applyUrl: payload.applyUrl || undefined,
        bidderName: payload.bidderName || undefined,
        contentType: payload.contentType || 'video/webm',
        fileName: payload.fileName || undefined,
        videoBase64: payload.videoBase64,
        durationSec: payload.durationSec ?? undefined,
        markCompleted: Boolean(payload.markCompleted),
      },
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  }

  async function completeBid(applierName, { jobId, bidderName }) {
    return fetchJson('/bid-results/complete', {
      method: 'POST',
      body: { applierName, jobId, bidderName: bidderName || undefined },
      timeoutMs: QUEUE_TIMEOUT_MS,
    });
  }

  async function skipBid(applierName, { jobId, bidderName }) {
    return fetchJson('/bid-results/skip', {
      method: 'POST',
      body: { applierName, jobId, bidderName: bidderName || undefined },
      timeoutMs: QUEUE_TIMEOUT_MS,
    });
  }

  async function saveBidFlags(applierName, { jobId, flags, summary }) {
    return fetchJson('/bid-results/flags', {
      method: 'POST',
      body: {
        applierName,
        jobId,
        flags: flags || undefined,
        summary: summary || undefined,
      },
      timeoutMs: QUEUE_TIMEOUT_MS,
    });
  }

  async function analyzeJobPage(applierName, { pageContext, sessionContext }) {
    return fetchJson('/job-analyze/page', {
      method: 'POST',
      body: {
        applierName,
        pageContext,
        sessionContext: sessionContext || undefined,
      },
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
  }

  async function analyzeJobFlags(applierName, { pageContext, sessionContext, neededFlags }) {
    return fetchJson('/job-analyze/flags', {
      method: 'POST',
      body: {
        applierName,
        pageContext,
        sessionContext: sessionContext || undefined,
        neededFlags: neededFlags || ['remote', 'clearance'],
      },
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
  }

  /**
   * Production bidder login against Athens.
   * Requires vendorAllowed + vendorPassword on the profile.
   */
  async function bidderSignIn(name, password, apiUrl) {
    const settings = await getSettings();
    const base = String(apiUrl || settings.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
    try {
      const response = await fetch(`${base}/auth/bidder-signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
        signal: AbortSignal.timeout(QUEUE_TIMEOUT_MS),
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok || !data?.success) {
        return {
          ok: false,
          error:
            data?.message ||
            data?.error ||
            (response.status === 0
              ? 'Cannot reach Athens. Check the API URL and that Athens-server is running.'
              : `Sign in failed (${response.status})`),
          code: data?.code || null,
        };
      }
      return { ok: true, user: data.user || { name } };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error && err.name === 'TimeoutError'
            ? 'Athens sign-in timed out. Is Athens-server running?'
            : err instanceof Error
              ? err.message
              : String(err),
        code: 'NETWORK',
      };
    }
  }

  async function checkAthensHealth() {
    const settings = await getSettings();
    const base = settings.apiUrl.replace(/\/$/, '');
    // Lightweight ping — do NOT use /bid-results (slow, large payload → false "down").
    try {
      const response = await fetch(`${base}/agents/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return {
        ok: true,
        healthy: response.ok,
        apiUrl: settings.apiUrl,
        status: response.status,
        error: response.ok ? null : `HTTP ${response.status} from ${base}/agents/health`,
      };
    } catch (err) {
      return {
        ok: false,
        healthy: false,
        apiUrl: settings.apiUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function checkGeneratedResumes(applierName, jobIds, options = {}) {
    const data = await fetchJson('/personal/agent-job-resumes/status', {
      method: 'POST',
      body: { applierName, jobIds },
      timeoutMs: options.timeoutMs ?? QUEUE_TIMEOUT_MS,
    });
    return new Set(Array.isArray(data.jobIds) ? data.jobIds.map(String) : []);
  }

  async function getResumePdfUrl(applierName, jobId) {
    const settings = await getSettings();
    const base = settings.apiUrl.replace(/\/$/, '');
    const params = new URLSearchParams({ applierName });
    return `${base}/personal/agent-job-resume/${encodeURIComponent(jobId)}/pdf?${params}`;
  }

  async function fetchResumePdf(applierName, jobId) {
    const url = await getResumePdfUrl(applierName, jobId);
    const response = await fetch(url, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      let message = `Draft PDF unavailable (${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const matched = /filename="([^"]+)"/i.exec(disposition);
    let fileName = matched?.[1] || `${String(applierName).replace(/[^\w.\-()+ ]+/g, '_')}.pdf`;
    fileName = fileName.replace(/-[a-f0-9]{8}(?=\.pdf$)/i, '');
    if (!fileName.toLowerCase().endsWith('.pdf')) fileName = `${fileName}.pdf`;
    return { blob, fileName, mimeType: 'application/pdf' };
  }

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  return {
    DEFAULT_API_URL,
    QUEUE_TIMEOUT_MS,
    UPLOAD_TIMEOUT_MS,
    ANALYZE_TIMEOUT_MS,
    getSettings,
    saveSettings,
    bidderSignIn,
    fetchBidReadyPools,
    startBid,
    uploadRecording,
    completeBid,
    skipBid,
    saveBidFlags,
    analyzeJobPage,
    analyzeJobFlags,
    checkAthensHealth,
    checkGeneratedResumes,
    getResumePdfUrl,
    fetchResumePdf,
    blobToBase64,
    mapTaskToJob,
  };
})();
