import { useCallback, useEffect, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { useResumeUploads } from '@/app/hooks/useResumeUploads';
import { profileNameToFileBase } from '@/lib/resume-filename';
import { Button } from './ui/button';

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname +
      (parsed.pathname.length > 24 ? `${parsed.pathname.slice(0, 24)}…` : parsed.pathname)
    );
  } catch {
    return url;
  }
}

function useProfileFileBase(): string | null {
  const [fileBase, setFileBase] = useState<string | null>(null);

  useEffect(() => {
    const read = async () => {
      const result = await chrome.storage.local.get(['applierName']);
      setFileBase(profileNameToFileBase(result.applierName ? String(result.applierName) : null));
    };
    void read();

    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !changes.applierName) return;
      const next = changes.applierName.newValue;
      setFileBase(profileNameToFileBase(next ? String(next) : null));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return fileBase;
}

export function ResumeUploadsPanel() {
  const { uploads, clear } = useResumeUploads();
  const fileBase = useProfileFileBase();

  const onClear = useCallback(() => {
    void clear();
  }, [clear]);

  return (
    <section className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden min-w-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-gradient-to-r from-violet-500/5 to-transparent">
        <FileUp className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <h3 className="text-xs font-bold text-foreground flex-1 text-left truncate">
          Resume uploads
          {uploads.length > 0 ? ` (${uploads.length})` : ''}
        </h3>
        {uploads.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
            onClick={onClear}
            title="Clear upload log"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="p-2.5 text-xs text-muted-foreground leading-relaxed space-y-2">
        <p className="text-[11px] leading-relaxed">
          Detected <span className="text-foreground font-medium">.pdf</span> /{' '}
          <span className="text-foreground font-medium">.docx</span> uploads are renamed to{' '}
          {fileBase ? (
            <>
              <code className="text-foreground bg-muted/50 px-1 rounded">{fileBase}.pdf</code>
              {' / '}
              <code className="text-foreground bg-muted/50 px-1 rounded">{fileBase}.docx</code>
            </>
          ) : (
            <span className="text-amber-400">load a profile first</span>
          )}
          .
        </p>

        {uploads.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/80 italic">
            No resume uploads detected yet on this browser.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto subtle-scroll">
            {uploads.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 space-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Original
                    </div>
                    <div
                      className="text-[11px] text-foreground font-medium truncate"
                      title={item.originalName}
                    >
                      {item.originalName}
                    </div>
                    {item.renamed && item.cleanedName ? (
                      <>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide pt-0.5">
                          Uploaded as
                        </div>
                        <div
                          className="text-[11px] text-emerald-400 font-medium truncate"
                          title={item.cleanedName}
                        >
                          {item.cleanedName}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-amber-400/90">
                        {item.profileFileBase
                          ? 'Name already matched profile'
                          : 'Not renamed (no profile loaded)'}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(item.ts)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                  <span className="uppercase tracking-wide">{item.source}</span>
                  <span>·</span>
                  <span className="truncate" title={item.pageUrl}>
                    {shortUrl(item.pageUrl)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
