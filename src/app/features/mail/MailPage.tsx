import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { checkMailCredentials, fetchMailFolderCounts, type FolderCounts } from "@/api/mail";
import { useApplier } from "@/context/applier-context";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { SearchField } from "../../components/shared/SearchField";
import { PATHS } from "../../config/routes";
import { MailSidebar } from "./components/MailSidebar";
import { MailListRow } from "./components/MailListRow";
import { MailDetailPane } from "./components/MailDetailPane";
import { MailComposeSheet } from "./components/MailComposeSheet";
import { useMailThreads } from "./hooks/useMailThreads";
import { useMailLabels } from "./hooks/useMailLabels";
import { useMailSync } from "./hooks/useMailSync";
import { groupThreadsByDate } from "./lib/mailLabelStyles";
import type { MailFolderId } from "../../../data/mail";
import type { MailThread } from "../../types";

export function MailPage() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { applier, applierReady } = useApplier();
  const applierName = applier?.name;

  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);
  const [folderCounts, setFolderCounts] = useState<FolderCounts | undefined>();
  const [activeThread, setActiveThread] = useState<MailThread | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const mail = useMailThreads(applierName);
  const { labels, createLabel, removeLabel, reload: reloadLabels } = useMailLabels(applierName);
  const { loadThreads, fetchThreadBody, cancelBodyFetch, page, pageSize, setPage, setPageSize, total } =
    mail;

  const loadCurrentPage = useCallback(() => {
    void loadThreads({ folder, labelFilter, search, page, pageSize });
  }, [loadThreads, folder, labelFilter, search, page, pageSize]);

  const reload = useCallback(() => {
    loadCurrentPage();
    void reloadLabels();
    if (applierName) {
      void fetchMailFolderCounts(applierName).then(setFolderCounts).catch(console.error);
    }
  }, [loadCurrentPage, reloadLabels, applierName]);

  useMailSync({
    applierName,
    applierReady,
    enabled: credentialsConfigured === true,
    onSyncComplete: reload,
  });

  useEffect(() => {
    if (!applierReady || !applierName) return;
    void checkMailCredentials(applierName).then((r) => setCredentialsConfigured(r.configured));
  }, [applierReady, applierName]);

  useEffect(() => {
    if (!applierReady || !applierName || credentialsConfigured !== true) return;
    void fetchMailFolderCounts(applierName).then(setFolderCounts).catch(console.error);
  }, [applierReady, applierName, credentialsConfigured]);

  useEffect(() => {
    if (!applierReady || !applierName || credentialsConfigured !== true) return;
    void loadThreads({ folder, labelFilter, search, page, pageSize });
  }, [applierReady, applierName, credentialsConfigured, folder, labelFilter, search, page, pageSize, loadThreads]);

  useEffect(() => {
    if (!threadId || !applierName) {
      setActiveThread(null);
      setDetailLoading(false);
      return;
    }

    cancelBodyFetch();
    const listThread = mail.threads.find((t) => t.id === threadId) ?? null;
    setActiveThread(listThread);
    setDetailLoading(true);

    void fetchThreadBody(threadId, folder).then((thread) => {
      if (thread) setActiveThread(thread);
      setDetailLoading(false);
    });
  }, [threadId, applierName, folder, fetchThreadBody, cancelBodyFetch]);

  const grouped = useMemo(() => groupThreadsByDate(mail.threads), [mail.threads]);
  const isThreadView = Boolean(threadId);

  const openThread = (id: string) => {
    navigate(`${PATHS.mail}/${id}`);
    mail.markUnread(id, false);
  };

  const backToList = () => navigate(PATHS.mail);
  const resetList = () => navigate(PATHS.mail);

  const handleFolderChange = (f: MailFolderId) => {
    setFolder(f);
    setPage(1);
    resetList();
  };

  const handleLabelChange = (l: string | null) => {
    setLabelFilter(l);
    setPage(1);
    resetList();
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  if (!applierReady) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading account…
      </div>
    );
  }

  if (credentialsConfigured === false) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Gmail not configured</h2>
          <p className="text-sm text-muted-foreground">
            Add your Gmail address and app password in Settings → Profile to use Mail.
          </p>
          <Link
            to={`${PATHS.settings}/profile`}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90"
          >
            Open Profile Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      <MailSidebar
        folder={folder}
        labelFilter={labelFilter}
        labels={labels}
        folderCounts={folderCounts}
        onFolderChange={handleFolderChange}
        onLabelChange={handleLabelChange}
        onCreateLabel={(name, parentId) => createLabel(name, parentId)}
        onRemoveLabel={removeLabel}
        onCompose={() => mail.openCompose()}
      />

      {!isThreadView ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b border-border flex-shrink-0 flex items-center gap-3">
            <SearchField
              value={search}
              onChange={handleSearchChange}
              placeholder="Search mail..."
              className="flex-1 max-w-xl"
            />
            {mail.syncing && !mail.loading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">Syncing…</span>
            )}
            {mail.loading && mail.threads.length === 0 && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            <button
              type="button"
              onClick={reload}
              className="icon-btn text-muted-foreground hover:text-foreground"
              aria-label="Refresh mail"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {mail.error && (
            <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b border-border">
              {mail.error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto subtle-scroll min-h-0">
            {mail.loading && mail.threads.length === 0 ? (
              <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading mail…
              </div>
            ) : mail.threads.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No messages</p>
            ) : (
              grouped.map((group) => (
                <div key={group.section}>
                  {group.label && (
                    <div className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border/40">
                      {group.label}
                    </div>
                  )}
                  {group.threads.map((t) => (
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
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border flex-shrink-0 px-3">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              detailed
            />
          </div>
        </div>
      ) : (
        <MailDetailPane
          key={threadId}
          thread={activeThread}
          fullView
          loading={detailLoading}
          onBack={backToList}
          onArchive={() => activeThread && mail.archive(activeThread.id)}
          onTrash={() => activeThread && mail.trash(activeThread.id)}
          onReply={() => activeThread && mail.openCompose(activeThread)}
        />
      )}

      <MailComposeSheet
        open={mail.composeOpen}
        onOpenChange={mail.setComposeOpen}
        onSend={mail.sendCompose}
        sending={mail.syncing}
        replyTo={mail.replyTo}
      />
    </div>
  );
}
