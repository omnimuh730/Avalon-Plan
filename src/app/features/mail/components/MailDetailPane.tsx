import React from "react";
import { ArrowLeft, Send, Sparkles, Archive, Trash2 } from "lucide-react";
import { Av, Badge } from "../../../components/ui";
import { MAIL_TAG_VARIANTS } from "../../../data/mail";
import type { MailThread } from "../../../types";

type MailDetailPaneProps = {
  thread: MailThread | null;
  fullView?: boolean;
  onBack?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onReply?: () => void;
};

export function MailDetailPane({
  thread,
  fullView = false,
  onBack,
  onArchive,
  onTrash,
  onReply,
}: MailDetailPaneProps) {
  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a message to read
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {fullView && onBack && (
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground min-h-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to inbox
          </button>
        </div>
      )}
      <div className="px-5 py-4 border-b border-border flex-shrink-0">
        <h2 className={fullView ? "text-xl font-bold text-foreground mb-3" : "text-base font-bold text-foreground mb-2"}>
          {thread.subj}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Av name={thread.from} size={fullView ? "md" : "sm"} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">{thread.from}</p>
            <p className="text-xs text-muted-foreground">to Jordan Doe · {thread.time}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {thread.labels.filter((l) => l !== "starred").map((l) => (
              <Badge key={l} v={MAIL_TAG_VARIANTS[l] ?? "subtle"}>
                {l}
              </Badge>
            ))}
            <button type="button" onClick={onArchive} className="icon-btn text-muted-foreground hover:text-foreground border border-border">
              <Archive className="w-4 h-4" />
            </button>
            <button type="button" onClick={onTrash} className="icon-btn text-muted-foreground hover:text-foreground border border-border">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className={`flex-1 overflow-auto subtle-scroll ${fullView ? "px-8 py-6 max-w-3xl mx-auto w-full" : "p-5"}`}>
        {thread.body.split("\n").map((line, i) => (
          <p key={i} className={`text-foreground/85 leading-relaxed mb-3 last:mb-0 ${fullView ? "text-base" : "text-sm"}`}>
            {line || "\u00A0"}
          </p>
        ))}
      </div>
      <div className={`border-t border-border p-4 flex-shrink-0 ${fullView ? "max-w-3xl mx-auto w-full" : ""}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onReply} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
            <Send className="w-4 h-4" />
            Reply
          </button>
          <button type="button" onClick={onReply} className="flex items-center gap-2 bg-secondary border border-border px-4 py-2 rounded-xl text-sm font-bold hover:bg-muted min-h-10">
            <Sparkles className="w-4 h-4 text-violet-600" />
            AI Reply
          </button>
        </div>
      </div>
    </div>
  );
}
