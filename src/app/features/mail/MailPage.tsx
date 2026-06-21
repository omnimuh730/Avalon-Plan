import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { checkMailCredentials } from "@/api/mail";
import { useApplier } from "@/context/applier-context";
import { SearchField } from "../../components/shared/SearchField";
import { PATHS } from "../../config/routes";
import { MailSidebar } from "./components/MailSidebar";
import { MailListRow } from "./components/MailListRow";
import { MailDetailPane } from "./components/MailDetailPane";
import { MailComposeSheet } from "./components/MailComposeSheet";
import { useMailThreads } from "./hooks/useMailThreads";
import { useMailLabels } from "./hooks/useMailLabels";
import { useMailSync } from "./hooks/useMailSync";
import type { MailFolderId } from "../../../data/mail";

export function MailPage() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { applier, applierReady } = useApplier();
  const applierName = applier?.name;

  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mail = useMailThreads(applierName);
  const { labels, createLabel } = useMailLabels(applierName);
  const { loadThreads, fetchThreadBody } = mail;

  const reload = useCallback(() => {
    void loadThreads({ folder, labelFilter, search });
  }, [loadThreads, folder, labelFilter, search]);

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
    void loadThreads({ folder, labelFilter, search });
  }, [applierReady, applierName, credentialsConfigured, folder, labelFilter, search, loadThreads]);

  useEffect(() => {
    if (!threadId || !applierName) return;
    const thread = mail.threads.find((t) => t.id === threadId);
    if (thread && !thread.hasBody) {
      void fetchThreadBody(threadId);
    }
  }, [threadId, applierName, mail.threads, fetchThreadBody]);

  const threads = useMemo(() => mail.threads, [mail.threads]);

  const selected = threadId ? mail.threads.find((t) => t.id === threadId) ?? null : null;
  const isThreadView = Boolean(threadId);

  const openThread = (id: string) => {
    navigate(`${PATHS.mail}/${id}`);
    mail.markUnread(id, false);
  };

  const backToList = () => navigate(PATHS.mail);
  const resetList = () => navigate(PATHS.mail);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      void mail.loadOlder();
    }
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
        onFolderChange={(f) => {
          setFolder(f);
          resetList();
        }}
        onLabelChange={(l) => {
          setLabelFilter(l);
          resetList();
        }}
        onCreateLabel={(name, parentId) => createLabel(name, parentId)}
        onCompose={() => mail.openCompose()}
      />

      {!isThreadView ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b border-border flex-shrink-0 flex items-center gap-3">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search mail..."
              className="flex-1 max-w-xl"
            />
            {mail.loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
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
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto subtle-scroll"
            onScroll={handleScroll}
          >
            {mail.loading && threads.length === 0 ? (
              <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading mail…
              </div>
            ) : threads.length === 0 ? (
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
            {mail.loadingOlder && (
              <div className="p-4 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <MailDetailPane
          thread={selected}
          fullView
          loading={selected && !selected.hasBody && !selected.body}
          onBack={backToList}
          onArchive={() => selected && mail.archive(selected.id)}
          onTrash={() => selected && mail.trash(selected.id)}
          onReply={() => selected && mail.openCompose(selected)}
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
