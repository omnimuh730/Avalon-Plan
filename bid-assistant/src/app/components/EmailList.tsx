import { useState } from 'react';
import { Tag, Circle, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { EmailModal } from './EmailModal';
import { GMAIL_LABEL } from '@/lib/constants';
import { prefetchEmailBody } from '@/lib/email-body-cache';
import type { Email } from '@/lib/gmail';

interface EmailListProps {
  emails: Email[];
  loading?: boolean;
  refreshing?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  lastScanned?: number;
  error?: string | null;
  hasCredentials?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
}

export function EmailList({
  emails,
  loading = false,
  refreshing = false,
  loadingMore = false,
  hasMore = false,
  lastScanned = 100,
  error = null,
  hasCredentials = false,
  onRefresh,
  onLoadMore,
}: EmailListProps) {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const groupedEmails = emails.reduce(
    (acc, email) => {
      const date = parseISO(email.timestamp);
      let group = 'Earlier';

      if (isToday(date)) {
        group = 'Today';
      } else if (isYesterday(date)) {
        group = 'Yesterday';
      }

      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(email);
      return acc;
    },
    {} as Record<string, Email[]>,
  );

  const formatTime = (timestamp: string) => {
    const date = parseISO(timestamp);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    }
    return format(date, 'MMM d');
  };

  const showSetup = !hasCredentials;

  const handlePrefetch = (email: Email) => {
    if (!email.body.trim() && !email.bodyHtml) {
      void prefetchEmailBody(email.id).catch(() => undefined);
    }
  };

  const handleOpen = (email: Email) => {
    handlePrefetch(email);
    setSelectedEmail(email);
  };

  return (
    <div className="relative flex flex-col h-full min-w-0 bg-background text-foreground">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-gradient-to-r from-violet-500/5 to-transparent">
        <Tag className="w-4 h-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-bold flex-1 truncate" title={GMAIL_LABEL}>
          {GMAIL_LABEL}
        </h1>
        <button
          onClick={onRefresh}
          disabled={loading || refreshing || !hasCredentials}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto subtle-scroll">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="text-xs">Loading emails…</span>
          </div>
        ) : showSetup ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <Tag className="w-8 h-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Connect your Gmail</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Load your applier profile at the top to read emails labeled{' '}
                <span className="text-foreground">{GMAIL_LABEL}</span>.
              </p>
            </div>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Tag className="w-6 h-6" />
            <span className="text-xs">No emails with label {GMAIL_LABEL}</span>
          </div>
        ) : (
          <>
            {Object.entries(groupedEmails).map(([group, groupEmails]) => (
              <div key={group}>
                {group !== 'Today' && (
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-background sticky top-0">
                    {group}
                  </div>
                )}

                {groupEmails.map((email) => (
                  <button
                    key={email.id}
                    onMouseEnter={() => handlePrefetch(email)}
                    onFocus={() => handlePrefetch(email)}
                    onClick={() => handleOpen(email)}
                    className={`w-full px-3 py-2 flex flex-col gap-0.5 border-b border-border/40 hover:bg-secondary/40 transition-colors text-left ${
                      !email.isRead ? 'bg-violet-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-xs">
                        {!email.isRead && (
                          <Circle className="w-1.5 h-1.5 fill-violet-500 text-violet-500 inline mr-1.5" />
                        )}
                        <span className={!email.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                          {email.sender}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(email.timestamp)}</span>
                    </div>
                    <div className="text-xs truncate">
                      <span className={!email.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {email.subject}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {hasMore && (
              <div className="p-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2 rounded-lg border border-border/60 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50 transition-colors"
                >
                  {loadingMore
                    ? 'Scanning older messages…'
                    : `Load more (next ${lastScanned})`}
                </button>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  Only {GMAIL_LABEL} shown · scans {lastScanned} per batch
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {selectedEmail && <EmailModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />}
    </div>
  );
}
