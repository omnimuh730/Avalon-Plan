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
    <div className="relative flex flex-col h-full bg-[#1a1a1a] text-gray-100">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-[#202020]">
        <Tag className="w-4 h-4 text-amber-500" />
        <h1 className="font-medium flex-1 truncate" title={GMAIL_LABEL}>
          {GMAIL_LABEL}
        </h1>
        <button
          onClick={onRefresh}
          disabled={loading || refreshing || !hasCredentials}
          className="p-1.5 rounded-md hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading emails…</span>
          </div>
        ) : showSetup ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <Tag className="w-10 h-10 text-gray-600" />
            <div>
              <p className="text-gray-300 font-medium mb-1">Connect your Gmail</p>
              <p className="text-sm text-gray-500">
                Load your applier profile at the top to read emails labeled{' '}
                <span className="text-gray-400">{GMAIL_LABEL}</span>.
              </p>
            </div>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500">
            <Tag className="w-8 h-8" />
            <span className="text-sm">No emails with label {GMAIL_LABEL}</span>
          </div>
        ) : (
          <>
            {Object.entries(groupedEmails).map(([group, groupEmails]) => (
              <div key={group}>
                {group !== 'Today' && (
                  <div className="px-4 py-2 text-xs text-gray-500 bg-[#1a1a1a] sticky top-0">{group}</div>
                )}

                {groupEmails.map((email) => (
                  <button
                    key={email.id}
                    onMouseEnter={() => handlePrefetch(email)}
                    onFocus={() => handlePrefetch(email)}
                    onClick={() => handleOpen(email)}
                    className={`w-full px-4 py-2.5 flex flex-col gap-1 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors text-left ${
                      !email.isRead ? 'bg-gray-900/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm">
                        {!email.isRead && (
                          <Circle className="w-2 h-2 fill-blue-500 text-blue-500 inline mr-2" />
                        )}
                        <span className={!email.isRead ? 'font-medium text-gray-100' : 'text-gray-400'}>
                          {email.sender}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">{formatTime(email.timestamp)}</span>
                    </div>
                    <div className="text-sm truncate">
                      <span className={!email.isRead ? 'font-medium text-gray-100' : 'text-gray-300'}>
                        {email.subject}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {hasMore && (
              <div className="p-4 border-t border-gray-800/50">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800/40 disabled:opacity-50 transition-colors"
                >
                  {loadingMore
                    ? 'Scanning older messages…'
                    : `Load more (scan next ${lastScanned} messages)`}
                </button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Only messages with {GMAIL_LABEL} are shown. Each batch scans {lastScanned} emails in All Mail.
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
