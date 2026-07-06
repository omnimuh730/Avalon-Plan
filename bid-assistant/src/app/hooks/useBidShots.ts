import { useEffect, useState } from 'react';
import { BID_SHOT_ADDED, getBidShots, type BidShot } from '@/lib/bid-session';

export function useBidShots(tabId: number | null) {
  const [shots, setShots] = useState<BidShot[]>([]);

  useEffect(() => {
    if (tabId == null) {
      setShots([]);
      return;
    }
    let cancelled = false;

    getBidShots(tabId)
      .then((initial) => {
        if (!cancelled) setShots(initial);
      })
      .catch(() => {
        if (!cancelled) setShots([]);
      });

    // Only append live captures that belong to the tab the panel is showing.
    const listener = (message: { type?: string; tabId?: number; shot?: BidShot }) => {
      if (message?.type === BID_SHOT_ADDED && message.shot && message.tabId === tabId) {
        setShots((prev) => [...prev, message.shot as BidShot]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [tabId]);

  return shots;
}
