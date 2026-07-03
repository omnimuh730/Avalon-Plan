import { useEffect } from 'react';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  title?: string;
  message: string;
  kind: NotificationKind;
}

const AUTO_DISMISS_MS: Record<NotificationKind, number> = {
  info: 6000,
  success: 5000,
  warning: 8000,
  error: 12000,
};

export function NotificationStack({
  items,
  onDismiss,
}: {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((item) =>
      window.setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS[item.kind]),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [items, onDismiss]);

  if (!items.length) return null;

  return (
    <div className="notification-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`notification notification-${item.kind}`}>
          <div className="notification-icon" aria-hidden>
            {item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : item.kind === 'warning' ? '⚠' : 'i'}
          </div>
          <div className="notification-body">
            {item.title && <p className="notification-title">{item.title}</p>}
            <p className="notification-message">{item.message}</p>
          </div>
          <button
            type="button"
            className="notification-dismiss"
            onClick={() => onDismiss(item.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
