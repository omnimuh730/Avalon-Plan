import React from "react";
import { Archive, Star, Trash2, Mail } from "lucide-react";
import { Badge } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { MAIL_TAG_VARIANTS } from "../../../data/mail";
import type { MailThread } from "../../../types";

type MailListRowProps = {
  thread: MailThread;
  selected: boolean;
  onSelect: () => void;
};

export function MailListRow({ thread, selected, onSelect }: MailListRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full text-left px-3 py-2 border-b border-border/40 hover:bg-secondary/50 transition-colors relative flex items-center gap-2 min-h-[44px]",
        selected && "bg-primary/5",
      )}
    >
      {thread.unread && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
      )}
      {!thread.unread && <span className="w-1.5 flex-shrink-0" />}
      <span
        className={cn(
          "text-sm w-28 flex-shrink-0 truncate",
          thread.unread ? "font-bold text-foreground" : "font-medium text-muted-foreground",
        )}
      >
        {thread.from.split(" ")[0]}
      </span>
      <span className={cn("text-sm flex-1 min-w-0 truncate", thread.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
        <span className="text-foreground">{thread.subj}</span>
        <span className="text-muted-foreground font-normal"> — {thread.prev}</span>
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {thread.labels.slice(0, 2).map((l) => (
          <Badge key={l} v={MAIL_TAG_VARIANTS[l] ?? "subtle"}>
            {l}
          </Badge>
        ))}
      </div>
      <span className="text-xs text-muted-foreground w-14 text-right flex-shrink-0">{thread.time}</span>
      <div className="hidden group-hover:flex items-center gap-0.5 absolute right-16 bg-background/90 rounded-lg px-1 shadow-sm border border-border">
        <button type="button" className="icon-btn w-7 h-7 text-muted-foreground hover:text-amber-500" onClick={(e) => e.stopPropagation()}>
          <Star className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="icon-btn w-7 h-7 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          <Archive className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="icon-btn w-7 h-7 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="icon-btn w-7 h-7 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          <Mail className="w-3.5 h-3.5" />
        </button>
      </div>
    </button>
  );
}
