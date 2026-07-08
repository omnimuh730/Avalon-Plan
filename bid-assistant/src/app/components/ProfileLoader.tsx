import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  UserCircle,
  XCircle,
} from 'lucide-react';
import type { ProfileCheck } from '@/lib/applier-profile';
import { useApplierProfile } from '@/app/hooks/useApplierProfile';
import { Button } from './ui/button';

const COLLAPSED_KEY = 'profileLoaderCollapsed';

function CheckRow({ label, check }: { label: string; check?: ProfileCheck | null }) {
  if (!check) return null;

  const Icon = check.ok ? CheckCircle2 : XCircle;

  return (
    <div className="flex items-start gap-2 text-[11px]">
      <Icon
        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${check.ok ? 'text-emerald-500' : 'text-red-400'}`}
      />
      <div className="min-w-0">
        <div className={`font-semibold ${check.ok ? 'text-emerald-400' : 'text-red-300'}`}>{label}</div>
        <div className="text-muted-foreground leading-relaxed">{check.message}</div>
      </div>
    </div>
  );
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (warn) {
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />;
  }
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        ok ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500/80'
      }`}
    />
  );
}

export function ProfileLoader({ onLoaded }: { onLoaded?: () => void }) {
  const {
    inputName,
    setInputName,
    loading,
    verifying,
    bridgeStatus,
    bridgeRunning,
    error,
    checks,
    ready,
    applierName,
    loadProfile,
  } = useApplierProfile();

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void chrome.storage.local.get(COLLAPSED_KEY).then((stored) => {
      if (typeof stored[COLLAPSED_KEY] === 'boolean') {
        setCollapsed(stored[COLLAPSED_KEY]);
      }
    });
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      void chrome.storage.local.set({ [COLLAPSED_KEY]: next });
      return next;
    });
  };

  const handleLoad = async () => {
    const result = await loadProfile();
    if (result) {
      onLoaded?.();
    }
  };

  const compactSummary = ready && applierName ? applierName : 'No profile';

  return (
    <div className="shrink-0 border-b border-border/60 bg-sidebar px-3 py-1.5 space-y-1.5">
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
          Checking bridge…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <UserCircle className="w-4 h-4 text-violet-500 shrink-0" />
            {collapsed ? (
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                <span className={ready ? 'text-emerald-400 font-semibold truncate' : 'text-muted-foreground'}>
                  {compactSummary}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <StatusDot ok={bridgeRunning} warn={!bridgeRunning} />
                  Bridge
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <StatusDot ok={bridgeStatus.mongoConnected} />
                  DB
                </span>
                {error && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertCircle className="w-3 h-3" />
                    Error
                  </span>
                )}
              </div>
            ) : (
              <>
                <input
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLoad();
                  }}
                  placeholder="Applier name…"
                  className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-input-background border border-border/60 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  disabled={verifying || !inputName.trim()}
                  onClick={() => void handleLoad()}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Load
                    </>
                  ) : (
                    'Load'
                  )}
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={collapsed ? 'Expand profile status' : 'Collapse profile status'}
              title={collapsed ? 'Expand profile status' : 'Collapse profile status'}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!collapsed && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground pl-6">
                {ready && applierName ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" />
                    {applierName}
                  </span>
                ) : (
                  <span>Load profile to use Inbox &amp; Job Bid</span>
                )}
                <span className="inline-flex items-center gap-1">
                  <StatusDot ok={bridgeRunning} warn={!bridgeRunning} />
                  Bridge {bridgeStatus.running ? 'online' : 'offline'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <StatusDot ok={bridgeStatus.mongoConnected} />
                  DB {bridgeStatus.mongoConnected ? 'connected' : 'offline'}
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {checks && (
                <div className="rounded-lg border border-border/60 bg-card/60 px-2.5 py-2 space-y-1.5">
                  <CheckRow label="Vendor access" check={checks.vendorAccess} />
                  <CheckRow label="Profile" check={checks.profile} />
                  <CheckRow label="Resume stacks" check={checks.resume} />
                  <CheckRow label="OpenAI key" check={checks.openai} />
                  <CheckRow label="Gmail IMAP" check={checks.gmail} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
