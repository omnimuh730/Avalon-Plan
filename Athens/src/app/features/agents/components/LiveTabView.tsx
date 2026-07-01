import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS, type WebRtcSignal } from "@avalon/shared";

interface LiveTabViewProps {
  socket: Socket | null;
  sessionId: string;
  tabId?: number;
  canExecute: boolean;
}

function friendlyLiveViewError(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/not been invoked|activeTab/i.test(message)) {
    return "Open the Avalon extension side panel on the job tab and click Start live view, then retry.";
  }
  return message;
}

/**
 * Live tab view consumer. The extension's offscreen document captures the tab and
 * acts as the WebRTC offerer; this component answers and renders the stream.
 * Signaling is relayed through the backend via WEBRTC_SIGNAL.
 */
export function LiveTabView({ socket, sessionId, tabId, canExecute }: LiveTabViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !canExecute) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    setErrorMsg(null);
    // If no media track arrives in time, surface a failure rather than hanging.
    const connectTimeout = setTimeout(() => {
      setStatus((s) => (s === "live" ? s : "error"));
      setErrorMsg((m) => m ?? "Live view didn't start (tab capture may need the tab active).");
    }, 12000);
    const send = (kind: WebRtcSignal["kind"], data?: unknown) =>
      socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, { sessionId, kind, tabId, data } satisfies WebRtcSignal);

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    // ICE candidates from the offerer can arrive before we've applied its offer;
    // addIceCandidate then rejects and the connection silently never forms. Queue
    // candidates until the remote description is set, then flush.
    const pendingIce: RTCIceCandidateInit[] = [];
    let remoteSet = false;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setStatus("live");
        clearTimeout(connectTimeout);
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) send("ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setStatus("error");
    };

    const onSignal = async (signal: WebRtcSignal) => {
      try {
        if (signal.kind === "offer") {
          await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
          remoteSet = true;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("answer", answer);
          // Flush any ICE candidates that arrived before the offer was applied.
          for (const cand of pendingIce.splice(0)) {
            await pc.addIceCandidate(cand).catch(() => {});
          }
        } else if (signal.kind === "ice" && signal.data) {
          const candidate = signal.data as RTCIceCandidateInit;
          if (remoteSet) await pc.addIceCandidate(candidate).catch(() => {});
          else pendingIce.push(candidate);
        } else if (signal.kind === "error") {
          setStatus("error");
          setErrorMsg(friendlyLiveViewError(signal.message) ?? "The extension could not capture the tab.");
          clearTimeout(connectTimeout);
        }
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Live view negotiation failed");
      }
    };

    socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, onSignal);
    // Ask the extension to start capturing this tab and send us an offer.
    send("request");

    return () => {
      clearTimeout(connectTimeout);
      send("stop");
      socket.off(SOCKET_EVENTS.WEBRTC_SIGNAL, onSignal);
      pc.getReceivers().forEach((r) => r.track?.stop());
      pc.close();
      pcRef.current = null;
    };
  }, [socket, sessionId, tabId, canExecute]);

  return (
    <div className="relative w-full h-full flex items-center justify-center mt-6">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-w-full max-h-[340px] rounded-lg border border-white/10 shadow-2xl object-contain bg-black"
      />
      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-medium text-white/60">
            {status === "connecting"
              ? "Connecting live view…"
              : status === "error"
                ? "Live view unavailable"
                : "Live view idle"}
          </p>
          <p className="text-xs text-white/35 mt-1 max-w-xs">
            {!canExecute
              ? "Connect the extension to start the live view."
              : errorMsg
                ? friendlyLiveViewError(errorMsg) ?? errorMsg
                : "Arm capture from the extension side panel (Start live view), then switch to Live here."}
          </p>
        </div>
      )}
    </div>
  );
}
