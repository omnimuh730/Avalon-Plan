(function () {
  if (window.__bidMonitorPageHook) return;
  window.__bidMonitorPageHook = true;

  let resumeSetFolder = '';
  let isRecording = false;

  window.addEventListener('bid-monitor-session', (event) => {
    const detail = event.detail || {};
    resumeSetFolder = String(detail.resumeSetFolder || '').trim();
    isRecording = !!detail.isRecording;
  });

  function getExtension(fileName) {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.slice(dot) : '';
  }

  function sanitizeForFileName(value) {
    return String(value || '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60);
  }

  function buildSubmittedFileName(originalName, folder) {
    const ext = getExtension(originalName) || '.pdf';
    const safe = sanitizeForFileName(folder);
    if (!safe) return originalName;
    return `${safe}${ext}`;
  }

  function isFileValue(value) {
    if (!value || typeof value !== 'object') return false;
    if (value instanceof File) return true;
    return (
      typeof value.name === 'string' &&
      typeof value.size === 'number' &&
      typeof value.arrayBuffer === 'function'
    );
  }

  function renameFile(file, newName) {
    if (file.name === newName) return file;
    return new File([file], newName, {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified ?? Date.now(),
    });
  }

  function shouldRename() {
    return isRecording && resumeSetFolder.length > 0;
  }

  function maybeRenameFile(file) {
    if (!shouldRename() || !isFileValue(file)) return file;
    const newName = buildSubmittedFileName(file.name, resumeSetFolder);
    return renameFile(file, newName);
  }

  function replaceInputFiles(input, files) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return false;

    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (descriptor?.set) {
      descriptor.set.call(input, dt.files);
    } else {
      input.files = dt.files;
    }

    return true;
  }

  function notifyResumeSelected(payload) {
    window.dispatchEvent(new CustomEvent('bid-monitor-resume', { detail: payload }));
  }

  function notifyToast(message) {
    window.dispatchEvent(new CustomEvent('bid-monitor-toast', { detail: { message } }));
  }

  function handleFileInputEvent(event) {
    try {
      const input = event.target;
      if (!shouldRename() || !(input instanceof HTMLInputElement) || input.type !== 'file') return;
      if (!input.files?.length) return;

      const originalFiles = Array.from(input.files);
      const dedupeKey = `${input.id}|${input.name}|${originalFiles.map((f) => `${f.name}:${f.size}`).join(',')}`;
      if (handleFileInputEvent.lastKey === dedupeKey) return;
      handleFileInputEvent.lastKey = dedupeKey;

      const renamedFiles = [];
      let anyRenamed = false;

      for (const file of originalFiles) {
        const renamed = maybeRenameFile(file);
        renamedFiles.push(renamed);
        if (renamed.name !== file.name) anyRenamed = true;

        notifyResumeSelected({
          originalFileName: file.name,
          submittedFileName: renamed.name,
          renamed: renamed.name !== file.name,
          fileName: file.name,
          fileSize: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || null,
          inputName: input.name || null,
          inputId: input.id || null,
          inputAccept: input.accept || null,
          pageUrl: location.href,
          pageTitle: document.title,
          source: 'file-input',
        });
      }

      if (anyRenamed && replaceInputFiles(input, renamedFiles)) {
        notifyToast(`Uploading as ${renamedFiles[0].name}`);
      }
    } catch (err) {
      console.warn('Bid Monitor: resume rename failed', err);
    }
  }

  document.addEventListener('change', handleFileInputEvent, true);
  document.addEventListener('input', handleFileInputEvent, true);
})();
