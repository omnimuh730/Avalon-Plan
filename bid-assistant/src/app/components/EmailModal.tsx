import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as Dialog from '@radix-ui/react-dialog';
import type { Email } from '@/lib/gmail';
import { getCachedEmailBody, loadEmailBody, primeEmailBodyCache } from '@/lib/email-body-cache';
import { EmailBody } from '@/app/components/EmailBody';

interface EmailModalProps {
  email: Email;
  onClose: () => void;
}

export function EmailModal({ email, onClose }: EmailModalProps) {
  const cached = getCachedEmailBody(email.id);
  const [displayEmail, setDisplayEmail] = useState<Email>(cached ?? email);
  const [loadingBody, setLoadingBody] = useState(!cached && !email.bodyHtml && !email.body.trim());
  const [bodyError, setBodyError] = useState<string | null>(null);

  const formattedDate = format(parseISO(displayEmail.timestamp), "MMM d, yyyy 'at' h:mm a");

  useEffect(() => {
    primeEmailBodyCache(email);

    if (email.bodyHtml || email.body.trim()) {
      setDisplayEmail(email);
      setLoadingBody(false);
      return;
    }

    const cachedBody = getCachedEmailBody(email.id);
    if (cachedBody) {
      setDisplayEmail(cachedBody);
      setLoadingBody(false);
      return;
    }

    let cancelled = false;
    setLoadingBody(true);
    setBodyError(null);

    void loadEmailBody(email.id)
      .then((full) => {
        if (!cancelled) {
          setDisplayEmail(full);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBodyError(err instanceof Error ? err.message : 'Failed to load email');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBody(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [email]);

  const showBody = !loadingBody && !bodyError;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-2 sm:inset-4 bg-[#202020] rounded-lg shadow-2xl border border-gray-700 overflow-hidden z-50 flex flex-col">
          <Dialog.Description className="sr-only">
            Full email message from {displayEmail.sender}
          </Dialog.Description>
          <div className="flex items-start justify-between p-4 border-b border-gray-800">
            <div className="flex-1 min-w-0 pr-2">
              <Dialog.Title className="text-base font-semibold text-gray-100 mb-2 leading-snug">
                {displayEmail.subject}
              </Dialog.Title>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-gray-300">{displayEmail.sender}</span>
                  <span className="text-gray-500 text-xs truncate">&lt;{displayEmail.senderEmail}&gt;</span>
                </div>
                <div className="text-gray-500 text-xs">{formattedDate}</div>
              </div>
            </div>
            <Dialog.Close className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-gray-400 hover:text-gray-200 flex-shrink-0">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loadingBody && (
              <div className="flex items-center gap-2 py-2 text-gray-500 text-xs mb-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching message…
              </div>
            )}
            {bodyError ? (
              <p className="text-sm text-amber-200">{bodyError}</p>
            ) : showBody ? (
              <EmailBody body={displayEmail.body} bodyHtml={displayEmail.bodyHtml} />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
