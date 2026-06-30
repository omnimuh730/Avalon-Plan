import { EXTENSION_MESSAGES } from '../../utils/constants';

/**
 * Offscreen document: the only extension context that can hold a MediaStream in
 * MV3. The background gets a tabCapture stream id and forwards it here; we open
 * the stream, become the WebRTC offerer, and exchange SDP/ICE with the viewer
 * (Athens) via the background relay.
 */

interface SignalMessage {
  kind: 'request' | 'stop' | 'offer' | 'answer' | 'ice' | 'error';
  data?: unknown;
  message?: string;
}

let pc: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;

function sendToBackground(kind: SignalMessage['kind'], data?: unknown, message?: string) {
  void chrome.runtime.sendMessage({
    type: EXTENSION_MESSAGES.WEBRTC_FROM_OFFSCREEN,
    payload: { kind, data, message },
  });
}

function teardown() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  pc?.close();
  pc = null;
}

async function startCapture(streamId: string) {
  teardown();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Chrome tab capture: non-standard constraints consumed via the stream id.
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    } as unknown as MediaStreamConstraints);

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    pc.onicecandidate = (event) => {
      if (event.candidate) sendToBackground('ice', event.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendToBackground('offer', offer);
  } catch (error) {
    teardown();
    sendToBackground('error', undefined, error instanceof Error ? error.message : String(error));
    console.error('[Avalon offscreen] capture failed', error);
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string; streamId?: string; payload?: SignalMessage }) => {
  if (message?.type === EXTENSION_MESSAGES.WEBRTC_START && message.streamId) {
    void startCapture(message.streamId);
    return;
  }
  if (message?.type === EXTENSION_MESSAGES.WEBRTC_STOP) {
    teardown();
    return;
  }
  if (message?.type === EXTENSION_MESSAGES.WEBRTC_TO_OFFSCREEN && message.payload) {
    const { kind, data } = message.payload;
    if (kind === 'answer' && pc) {
      void pc.setRemoteDescription(data as RTCSessionDescriptionInit);
    } else if (kind === 'ice' && data && pc) {
      void pc.addIceCandidate(data as RTCIceCandidateInit);
    }
  }
});
