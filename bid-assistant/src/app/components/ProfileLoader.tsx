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
    <div className="flex items-start gap-2 text-xs">
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${check.ok ? 'text-green-400' : 'text-red-400'}`} />
      <div className="min-w-0">
        <div className={`font-medium ${check.ok ? 'text-green-300' : 'text-red-300'}`}>{label}</div>
        <div className="text-gray-500 leading-relaxed">{check.message}</div>
      </div>
    </div>
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

  const compactSummary = ready && applierName ? `Loaded: ${applierName}` : 'Profile not loaded';

  return (
    <div className="border-b border-gray-800 bg-[#181818] px-3 py-2 space-y-2">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking bridge and database…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-blue-400 shrink-0" />
            {collapsed ? (
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className={ready ? 'text-green-400' : 'text-gray-500'}>{compactSummary}</span>
                <span className={bridgeRunning ? 'text-green-500' : 'text-amber-500'}>
                  Bridge {bridgeStatus.running ? 'online' : 'offline'}
                </span>
                <span className={bridgeStatus.mongoConnected ? 'text-green-500' : 'text-red-400'}>
                  DB {bridgeStatus.mongoConnected ? 'connected' : 'offline'}
                </span>
                {error && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertCircle className="w-3 h-3" /> Error
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
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-[#101010] border border-gray-800 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-gray-600"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-gray-700 bg-[#202020] hover:bg-[#262626] text-gray-100"
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
              className="shrink-0 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-[#262626]"
              aria-label={collapsed ? 'Expand profile status' : 'Collapse profile status'}
              title={collapsed ? 'Expand profile status' : 'Collapse profile status'}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {!collapsed && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {ready && applierName ? (
                  <span className="inline-flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Loaded: {applierName}
                  </span>
                ) : (
                  <span className="text-gray-500">Load your lancer applier profile to use Inbox and Job Bid.</span>
                )}
                <span className={bridgeRunning ? 'text-green-500' : 'text-amber-500'}>
                  Bridge {bridgeStatus.running ? 'online' : 'offline'}
                </span>
                <span className={bridgeStatus.mongoConnected ? 'text-green-500' : 'text-red-400'}>
                  DB {bridgeStatus.mongoConnected ? 'connected' : 'offline'}
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-2 text-xs text-red-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {checks && (
                <div className="rounded-md border border-gray-800 bg-[#101010] px-2.5 py-2 space-y-1.5">
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
