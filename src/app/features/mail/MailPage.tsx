import React, { useMemo, useState } from "react";
import { SearchField } from "../../components/shared/SearchField";
import { MailSidebar } from "./components/MailSidebar";
import { MailListRow } from "./components/MailListRow";
import { MailDetailPane } from "./components/MailDetailPane";
import { MailComposeSheet } from "./components/MailComposeSheet";
import { useMailThreads } from "./hooks/useMailThreads";
import { useMailLabels } from "./hooks/useMailLabels";
import type { MailFolderId } from "../../../data/mail";

type MailView = "list" | "thread";

export function MailPage() {
  const mail = useMailThreads();
  const { labels, createLabel } = useMailLabels();
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<MailView>("list");

  const threads = useMemo(() => {
    return mail.threads.filter((t) => {
      if (t.folder !== folder) return false;
      if (labelFilter && !t.labels.includes(labelFilter)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.from.toLowerCase().includes(q) ||
          t.subj.toLowerCase().includes(q) ||
          t.prev.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [mail.threads, folder, labelFilter, search]);

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const openThread = (id: string) => {
    setSelectedId(id);
    setView("thread");
    mail.markUnread(id, false);
  };

  const backToList = () => {
    setView("list");
    setSelectedId(null);
  };

  return (
    <div className="h-full flex overflow-hidden">
      <MailSidebar
        folder={folder}
        labelFilter={labelFilter}
        labels={labels}
        onFolderChange={(f) => {
          setFolder(f);
          setSelectedId(null);
          setView("list");
        }}
        onLabelChange={(l) => {
          setLabelFilter(l);
          setView("list");
          setSelectedId(null);
        }}
        onCreateLabel={(name, parentId) => createLabel(name, parentId)}
        onCompose={() => mail.setComposeOpen(true)}
      />

      {view === "list" ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b border-border flex-shrink-0">
            <SearchField value={search} onChange={setSearch} placeholder="Search mail..." className="w-full max-w-xl" />
          </div>
          <div className="flex-1 overflow-y-auto subtle-scroll">
            {threads.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No messages</p>
            ) : (
              threads.map((t) => (
                <MailListRow
                  key={t.id}
                  thread={t}
                  selected={false}
                  onSelect={() => openThread(t.id)}
                  onStar={() => mail.star(t.id)}
                  onArchive={() => mail.archive(t.id)}
                  onTrash={() => mail.trash(t.id)}
                  onMarkUnread={() => mail.markUnread(t.id, true)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <MailDetailPane
          thread={selected}
          fullView
          onBack={backToList}
          onArchive={() => selected && mail.archive(selected.id)}
          onTrash={() => selected && mail.trash(selected.id)}
          onReply={() => selected && mail.setComposeOpen(true)}
        />
      )}

      <MailComposeSheet open={mail.composeOpen} onOpenChange={mail.setComposeOpen} onSend={mail.sendCompose} />
    </div>
  );
}
