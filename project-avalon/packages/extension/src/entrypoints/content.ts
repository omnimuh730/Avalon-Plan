import { EXTENSION_MESSAGES } from '../utils/constants';
import { executeRemoteAction } from '../utils/action-executor';
import { runInjectionPlan } from '../utils/injection-plan-runner';
import { createInjectionHelpers } from '../utils/injection-helpers';
import { findSubmitControl } from '../utils/submit-finder';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'avalon:ping') {
        sendResponse({ ok: true });
        return false;
      }

      if (message?.type === EXTENSION_MESSAGES.RUN_INJECTION_PLAN) {
        void runInjectionPlan(message.plan)
          .then((data) => sendResponse({ ok: true, data }))
          .catch((error) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return true;
      }

      if (message?.type === EXTENSION_MESSAGES.RUN_SUBMIT) {
        try {
          const control = findSubmitControl();
          if (!control) {
            sendResponse({ ok: true, clicked: false });
          } else {
            const label = (control.textContent ?? '').trim() || control.getAttribute('value') || '';
            createInjectionHelpers().click(control);
            sendResponse({ ok: true, clicked: true, label });
          }
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return false;
      }

      if (message?.type !== EXTENSION_MESSAGES.EXECUTE_IN_TAB) {
        return false;
      }

      void executeRemoteAction(message.action).then(sendResponse);
      return true;
    });
  },
});
