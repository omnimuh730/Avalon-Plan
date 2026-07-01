export const AVALON_SERVER_KEY = 'avalonServerUrl';
export const AVALON_SESSION_KEY = 'avalonSessionId';
export const DEFAULT_SERVER_URL = 'http://localhost:3847';

export const EXTENSION_MESSAGES = {
  EXECUTE_IN_TAB: 'avalon:execute-in-tab',
  EXECUTE_RESULT: 'avalon:execute-result',
  RUN_INJECTION_PLAN: 'avalon:run-injection-plan',
  ATTACH_TAGGED_FILES: 'avalon:attach-tagged-files',
  RUN_SUBMIT: 'avalon:run-submit',
  // WebRTC live-view bridge between the background relay and the offscreen capturer.
  WEBRTC_START: 'avalon:webrtc-start',
  WEBRTC_TO_OFFSCREEN: 'avalon:webrtc-to-offscreen',
  WEBRTC_FROM_OFFSCREEN: 'avalon:webrtc-from-offscreen',
  WEBRTC_ARM_CAPTURE: 'avalon:webrtc-arm-capture',
  WEBRTC_ARM_STATUS: 'avalon:webrtc-arm-status',
  WEBRTC_STOP: 'avalon:webrtc-stop',
  RELAY_CONNECT: 'avalon:relay-connect',
  RELAY_DISCONNECT: 'avalon:relay-disconnect',
  RELAY_STATUS: 'avalon:relay-status',
} as const;
