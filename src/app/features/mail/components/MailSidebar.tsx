import React, { useState } from "react";
import { Inbox, Send, FileEdit, Trash2, AlertOctagon, Plus, Tag } from "lucide-react";
import { cn } from "../../../lib/utils";
import { LABEL_DOT_CLASS, MAIL_FOLDERS, type MailFolderId } from "../../../data/mail";
import { buildLabelTree } from "../hooks/useMailLabels";
import { MailCreateLabelDialog } from "./MailCreateLabelDialog";
import type { MailLabel } from "../../../types";

const FOLDER_ICONS: Record<MailFolderId, React.ElementType> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  trash: Trash2,
  spam: AlertOctagon,
};

type MailSidebarProps = {
  folder: MailFolderId;
  labelFilter: string | null;
  labels: MailLabel[];
  onFolderChange: (f: MailFolderId) => void;
  onLabelChange: (label: string | null) => void;
  onCreateLabel: (name: string, parentId?: string) => void;
  onCompose?: () => void;
};

export function MailSidebar({
  folder,
  labelFilter,
  labels,
  onFolderChange,
  onLabelChange,
  onCreateLabel,
  onCompose,
}: MailSidebarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const tree = buildLabelTree(labels);

  return (
    <>
      <aside className="w-52 border-r border-border flex flex-col flex-shrink-0 bg-card/40 py-3">
        <div className="px-3 mb-3">
          <button
            type="button"
            onClick={onCompose}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-9"
          >
            <Plus className="w-4 h-4" />
            Compose
          </button>
        </div>
        <nav className="px-2 space-y-0.5">
          {MAIL_FOLDERS.map((f) => {
            const Icon = FOLDER_ICONS[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onFolderChange(f.id);
                  onLabelChange(null);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors min-h-9",
                  folder === f.id && !labelFilter
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{f.label}</span>
                {f.count > 0 && (
                  <span className="text-xs font-bold text-primary">{f.count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 px-3 flex-1 overflow-y-auto subtle-scroll">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Labels
          </p>
          <div className="space-y-0.5">
            {tree.map(({ label: l, depth }) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onLabelChange(labelFilter === l.name ? null : l.name)}
                className={cn(
                  "w-full flex items-center gap-2 py-1.5 rounded-lg text-sm transition-colors",
                  labelFilter === l.name
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
                style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: "12px" }}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    LABEL_DOT_CLASS[l.color],
                  )}
                />
                <span className="truncate">{l.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            >
              <Plus className="w-3.5 h-3.5" />
              Add label
            </button>
          </div>
        </div>
      </aside>

      <MailCreateLabelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels}
        onCreate={onCreateLabel}
      />
    </>
  );
}
