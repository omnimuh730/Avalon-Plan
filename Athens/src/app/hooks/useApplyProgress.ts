import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_SESSION_ID, SOCKET_EVENTS, type ApplyProgress } from "@avalon/shared";
import { avalonRelayUrl } from "../services/agentApi";

/** Auto-dismiss the overlay this long after a terminal phase. */
const TERMINAL_HIDE_MS = 4000;
const TERMINAL_PHASES: ApplyProgress["phase"][] = ["submitted", "done", "error"];

/**
 * Subscribe to the Avalon relay as a read-only observer and surface the latest
 * apply-progress update (file upload → field fill → submit countdown). Does not
 * take the controller slot, so it never interferes with the Avalon frontend.
 */
export function useApplyProgress(sessionId: string = DEFAULT_SESSION_ID): ApplyProgress | null {
  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket: Socket = io(avalonRelayUrl(), {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit(SOCKET_EVENTS.REGISTER, { role: "observer", sessionId });
    });

    socket.on(SOCKET_EVENTS.APPLY_PROGRESS, (update: ApplyProgress) => {
      setProgress(update);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (TERMINAL_PHASES.includes(update.phase)) {
        hideTimer.current = setTimeout(() => setProgress(null), TERMINAL_HIDE_MS);
      }
    });

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [sessionId]);

  return progress;
}
