import { useState, useRef, useEffect } from "react";
import { INIT_MSGS, AI_REPLY } from "../data/copilot";
import type { Msg } from "../types";

export function useCopilotChat() {
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [activeConv, setActiveConv] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const send = () => {
    if (!input.trim() || typing) return;
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMsgs((p) => [...p, { id: Date.now().toString(), role: "user", content: input, ts }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "ai",
          ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          content: AI_REPLY,
        },
      ]);
    }, 1800);
  };

  return { msgs, input, setInput, typing, activeConv, setActiveConv, endRef, send };
}
