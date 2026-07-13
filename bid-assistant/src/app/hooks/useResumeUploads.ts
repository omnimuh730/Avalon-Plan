import { useCallback, useEffect, useState } from 'react';
import {
  clearResumeUploads,
  getResumeUploads,
  RESUME_UPLOADS_STORAGE_KEY,
  type ResumeUploadEvent,
} from '@/lib/resume-uploads';

export function useResumeUploads() {
  const [uploads, setUploads] = useState<ResumeUploadEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getResumeUploads();
      setUploads(next);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !changes[RESUME_UPLOADS_STORAGE_KEY]) return;
      const next = changes[RESUME_UPLOADS_STORAGE_KEY].newValue;
      setUploads(Array.isArray(next) ? (next as ResumeUploadEvent[]) : []);
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refresh]);

  const clear = useCallback(async () => {
    await clearResumeUploads();
    setUploads([]);
  }, []);

  return { uploads, loading, refresh, clear };
}
