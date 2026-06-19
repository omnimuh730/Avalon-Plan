import React, { useMemo, useState } from "react";
import { SearchField } from "../../components/shared/SearchField";
import { MailSidebar } from "./components/MailSidebar";
import { MailListRow } from "./components/MailListRow";
import { MailDetailPane } from "./components/MailDetailPane";
import { MAIL_THREADS, type MailFolderId } from "../../data/mail";

export function MailPage() {
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(MAIL_THREADS[0]?.id ?? null);

  const threads = useMemo(() => {
    return MAIL_THREADS.filter((t) => {
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
  }, [folder, labelFilter, search]);

  const selected = threads.find((t) => t.id === selectedId) ?? threads[0] ?? null;

  return (
    <div className="h-full flex overflow-hidden">
      <MailSidebar
        folder={folder}
        labelFilter={labelFilter}
        onFolderChange={(f) => {
          setFolder(f);
          setSelectedId(null);
        }}
        onLabelChange={setLabelFilter}
      />
      <div className="w-[420px] border-r border-border flex flex-col flex-shrink-0 min-w-0">
        <div className="p-3 border-b border-border flex-shrink-0">
          <SearchField value={search} onChange={setSearch} placeholder="Search mail..." className="w-full" />
        </div>
        <div className="flex-1 overflow-y-auto subtle-scroll">
          {threads.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No messages</p>
          ) : (
            threads.map((t) => (
              <MailListRow
                key={t.id}
                thread={t}
                selected={selected?.id === t.id}
                onSelect={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>
      </div>
      <MailDetailPane thread={selected} />
    </div>
  );
}
