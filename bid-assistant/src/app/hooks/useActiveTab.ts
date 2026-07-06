import { useEffect, useState } from 'react';

// Tracks the tab the side panel is currently bound to. A Chrome side panel is
// shared across a window's tabs, so the panel must follow the active tab: every
// bid session, its screenshots, analysis history and token usage are keyed by
// this tabId in the service worker. Switching tabs re-points all the panel hooks
// at the newly active tab's state.
export function useActiveTab(): number | null {
  const [tabId, setTabId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let windowId: number | undefined;

    const resolveActive = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          windowId: windowId ?? chrome.windows.WINDOW_ID_CURRENT,
        });
        if (!cancelled && typeof tab?.id === 'number') setTabId(tab.id);
      } catch {
        // Service worker / windows API not ready; keep the last known tab.
      }
    };

    void (async () => {
      try {
        const win = await chrome.windows.getCurrent();
        windowId = win.id;
      } catch {
        // Fall back to WINDOW_ID_CURRENT in resolveActive.
      }
      await resolveActive();
    })();

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      if (windowId == null || info.windowId === windowId) setTabId(info.tabId);
    };
    const onFocusChanged = () => {
      void resolveActive();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.windows.onFocusChanged.addListener(onFocusChanged);

    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.windows.onFocusChanged.removeListener(onFocusChanged);
    };
  }, []);

  return tabId;
}
