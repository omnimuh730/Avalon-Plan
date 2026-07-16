import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clapperboard,
  Play,
  Search,
  ExternalLink,
  Circle,
  CheckCircle2,
  Clock,
  Film,
  Folder,
  ChevronRight,
  LayoutGrid,
  Rows3,
  ArrowLeft,
} from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import type { BidResult, BidResultStatus, FlagLight, PeriodPreset, ViewMode } from "./types";
import { BID_STATUSES } from "./types";
import {
  STATUS_LABELS,
  PERIOD_LABELS,
  computeKpis,
  formatDuration,
  formatWhen,
  formatFolderShort,
  loadMockBidResults,
  filterByPeriod,
  buildDateFolders,
} from "./mockData";
import { MediaPlayerModal } from "./components/MediaPlayerModal";
import "./bid-management.css";

function FlagDot({ label, value }: { label: string; value: FlagLight }) {
  const tone = value === "green" ? "green" : value === "red" ? "red" : "muted";
  return (
    <span className={`bm-flag ${tone}`}>
      <Circle className="w-2.5 h-2.5" fill="currentColor" />
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: BidResultStatus }) {
  return <span className={`bm-status ${status}`}>{STATUS_LABELS[status]}</span>;
}

function DetailPane({
  result,
  onWatch,
}: {
  result: BidResult | null;
  onWatch: () => void;
}) {
  if (!result) {
    return (
      <div className="bm-detail empty">
        <Clapperboard className="w-9 h-9 opacity-30 mb-3" />
        <p>Select a bid ticket to review details and recording</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={result.id}
        className="bm-detail"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="bm-detail-head">
          <div>
            <div className="bm-eyebrow">Bid result</div>
            <h2 className="bm-detail-title">{result.job.title}</h2>
            <p className="bm-detail-sub">
              {result.job.company} · {result.job.location}
            </p>
          </div>
          <StatusPill status={result.status} />
        </div>

        <div className="bm-detail-row">
          <div className="bm-bidder-chip">
            <span className="bm-avatar sm">{result.bidder.avatarInitials}</span>
            <div>
              <div className="bm-bidder-name">{result.bidder.name}</div>
              <div className="bm-muted">Bidder</div>
            </div>
          </div>
          {result.matchScore != null ? (
            <div className="bm-score">
              <span className="bm-score-val">{result.matchScore}%</span>
              <span className="bm-muted">Match</span>
            </div>
          ) : null}
        </div>

        <div className="bm-flags">
          <FlagDot label="Remote" value={result.flags.remote} />
          <FlagDot label="No clearance" value={result.flags.clearance} />
        </div>

        <div className="bm-timeline">
          <div className="bm-eyebrow">Timeline</div>
          <ol>
            <li className="done">
              <CheckCircle2 className="w-4 h-4" />
              <div>
                <strong>Pooled</strong>
                <span>{formatWhen(result.pooledAt)}</span>
              </div>
            </li>
            <li className={result.recording || result.submittedAt ? "done" : "pending"}>
              {result.recording ? <Film className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              <div>
                <strong>Recording</strong>
                <span>
                  {result.recording
                    ? `${(result.recording.sizeBytes / 1024).toFixed(0)} KB · ${result.recording.contentType.split(";")[0]}`
                    : "Not uploaded yet"}
                </span>
              </div>
            </li>
            <li className={result.submittedAt ? "done" : "pending"}>
              {result.submittedAt ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              <div>
                <strong>Submitted</strong>
                <span>{formatWhen(result.submittedAt)}</span>
              </div>
            </li>
          </ol>
        </div>

        {result.notes ? (
          <div className="bm-notes">
            <div className="bm-eyebrow">Notes</div>
            <p>{result.notes}</p>
          </div>
        ) : null}

        <div className="bm-actions">
          {result.recording ? (
            <button type="button" className="bm-primary" onClick={onWatch}>
              <Play className="w-4 h-4" fill="currentColor" />
              Watch recording
            </button>
          ) : (
            <button type="button" className="bm-primary" disabled>
              <Play className="w-4 h-4" />
              No recording yet
            </button>
          )}
          <a className="bm-secondary" href={result.job.applyUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5" />
            Job link
          </a>
        </div>

        {result.recording ? <div className="bm-storage-path">{result.recording.storagePath}</div> : null}
      </motion.div>
    </AnimatePresence>
  );
}

function TicketCard({
  result,
  active,
  compact,
  onSelect,
}: {
  result: BidResult;
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`bm-ticket ${active ? "active" : ""} ${compact ? "compact" : ""}`} onClick={onSelect}>
      <div className="bm-ticket-top">
        <span className="bm-avatar xs">{result.bidder.avatarInitials}</span>
        <span className="bm-ticket-company">{result.job.company}</span>
        {result.recording ? <Film className="w-3 h-3 bm-ticket-rec" /> : null}
      </div>
      <div className="bm-ticket-title">{result.job.title}</div>
      <div className="bm-ticket-foot">
        <span>{result.bidder.name}</span>
        <span>{formatDuration(result.durationSec)}</span>
      </div>
    </button>
  );
}

function DateFolderGrid({
  folders,
  onOpen,
}: {
  folders: ReturnType<typeof buildDateFolders>;
  onOpen: (dayKey: string) => void;
}) {
  if (folders.length === 0) {
    return <div className="bm-empty pane">No bid folders in this period</div>;
  }

  return (
    <div className="bm-folder-grid">
      {folders.map((f, i) => (
        <motion.button
          key={f.dayKey}
          type="button"
          className="bm-folder"
          onClick={() => onOpen(f.dayKey)}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: Math.min(i * 0.03, 0.25), duration: 0.22 }}
        >
          <div className="bm-folder-icon">
            <Folder className="w-11 h-11" fill="currentColor" strokeWidth={1.15} />
          </div>
          <div className="bm-folder-name">{formatFolderShort(f.dayKey)}</div>
          <div className="bm-folder-date">{f.label}</div>
          <div className="bm-folder-count">
            {f.count} {f.count === 1 ? "bid" : "bids"}
          </div>
          <div className="bm-folder-pips">
            {BID_STATUSES.filter((s) => f.byStatus[s] > 0).map((s) => (
              <span key={s} className={`bm-pip ${s}`} title={`${STATUS_LABELS[s]}: ${f.byStatus[s]}`} />
            ))}
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function KanbanBoard({
  results,
  selectedId,
  onSelect,
}: {
  results: BidResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bm-kanban subtle-scroll">
      {BID_STATUSES.map((status) => {
        const col = results.filter((r) => r.status === status);
        return (
          <div key={status} className="bm-kanban-col">
            <div className="bm-kanban-head">
              <StatusPill status={status} />
              <span className="bm-muted mono">{col.length}</span>
            </div>
            <div className="bm-kanban-cards">
              {col.length === 0 ? (
                <div className="bm-kanban-empty">Empty</div>
              ) : (
                col.map((r) => (
                  <TicketCard
                    key={r.id}
                    result={r}
                    compact
                    active={selectedId === r.id}
                    onSelect={() => onSelect(r.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListBoard({
  results,
  selectedId,
  onSelect,
}: {
  results: BidResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bm-list-board subtle-scroll">
      {results.length === 0 ? (
        <div className="bm-empty">No bids for this day</div>
      ) : (
        results.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.2) }}
          >
            <div className={`bm-list-row ${selectedId === r.id ? "active" : ""}`}>
              <button type="button" className="bm-list-main" onClick={() => onSelect(r.id)}>
                <span className="bm-avatar">{r.bidder.avatarInitials}</span>
                <div className="bm-list-copy">
                  <div className="bm-list-title">{r.job.title}</div>
                  <div className="bm-list-sub">
                    {r.job.company} · {r.bidder.name} · {r.job.source}
                  </div>
                </div>
                <StatusPill status={r.status} />
                <span className="bm-list-dur">{formatDuration(r.durationSec)}</span>
                {r.recording ? <Film className="w-3.5 h-3.5 bm-ticket-rec" /> : <span className="bm-list-spacer" />}
              </button>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}

export function BidManagementPage() {
  const allResults = useMemo(() => loadMockBidResults(), []);
  const [period, setPeriod] = useState<PeriodPreset>("14d");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const periodResults = useMemo(() => filterByPeriod(allResults, period), [allResults, period]);
  const folders = useMemo(() => buildDateFolders(periodResults), [periodResults]);
  const periodKpis = useMemo(() => computeKpis(periodResults), [periodResults]);

  const dayResults = useMemo(() => {
    if (!selectedDay) return [];
    const q = query.trim().toLowerCase();
    return periodResults
      .filter((r) => r.dayKey === selectedDay)
      .filter((r) => {
        if (!q) return true;
        return (
          r.job.title.toLowerCase().includes(q) ||
          r.job.company.toLowerCase().includes(q) ||
          r.bidder.name.toLowerCase().includes(q) ||
          r.job.source.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.pooledAt.localeCompare(a.pooledAt));
  }, [periodResults, selectedDay, query]);

  const selected = dayResults.find((r) => r.id === selectedId) ?? dayResults[0] ?? null;
  const playingResult = playing ? selected : null;
  const activeFolder = folders.find((f) => f.dayKey === selectedDay) ?? null;

  const openDay = (dayKey: string) => {
    setSelectedDay(dayKey);
    setSelectedId(null);
    setQuery("");
    setPlaying(false);
  };

  const backToFolders = () => {
    setSelectedDay(null);
    setSelectedId(null);
    setPlaying(false);
  };

  return (
    <PageShell fullWidth className="bm-page">
      <div className="bm-shell">
        <motion.header
          className="bm-hero"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <div className="bm-brand-row">
              <Clapperboard className="w-5 h-5 bm-brand-icon" />
              <span className="bm-brand">Bid Management</span>
              <span className="bm-mock-tag">Mock data</span>
            </div>
            <p className="bm-hero-sub">Pool → record → review · browse by date folders</p>
          </div>

          <div className="bm-hero-right">
            <div className="bm-period">
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={period === p ? "active" : ""}
                  onClick={() => {
                    setPeriod(p);
                    setSelectedDay(null);
                  }}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="bm-kpis compact">
              {BID_STATUSES.map((key) => (
                <div key={key} className="bm-kpi static">
                  <span className="bm-kpi-val">{periodKpis[key]}</span>
                  <span className="bm-kpi-label">{STATUS_LABELS[key]}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.header>

        <div className="bm-pathbar">
          <button type="button" className="bm-crumb" onClick={backToFolders}>
            Bid folders
          </button>
          {activeFolder ? (
            <>
              <ChevronRight className="w-3.5 h-3.5 opacity-40" />
              <span className="bm-crumb current">{activeFolder.label}</span>
            </>
          ) : null}
          <span className="bm-path-meta">
            {selectedDay ? `${dayResults.length} tickets` : `${folders.length} date folders · ${periodResults.length} bids`}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {!selectedDay ? (
            <motion.div
              key="folders"
              className="bm-folder-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DateFolderGrid folders={folders} onOpen={openDay} />
            </motion.div>
          ) : (
            <motion.div
              key={`day-${selectedDay}`}
              className="bm-day-pane"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div className="bm-day-toolbar">
                <button type="button" className="bm-back" onClick={backToFolders}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Folders
                </button>

                <div className="bm-mode-toggle">
                  <button
                    type="button"
                    className={viewMode === "kanban" ? "active" : ""}
                    onClick={() => setViewMode("kanban")}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Kanban
                  </button>
                  <button
                    type="button"
                    className={viewMode === "list" ? "active" : ""}
                    onClick={() => setViewMode("list")}
                  >
                    <Rows3 className="w-3.5 h-3.5" />
                    List
                  </button>
                </div>

                <div className="bm-search grow">
                  <Search className="w-3.5 h-3.5" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter tickets…"
                    aria-label="Filter tickets"
                  />
                </div>
              </div>

              <div className={`bm-day-workspace ${viewMode}`}>
                <div className="bm-day-board">
                  {viewMode === "kanban" ? (
                    <KanbanBoard
                      results={dayResults}
                      selectedId={selected?.id ?? null}
                      onSelect={setSelectedId}
                    />
                  ) : (
                    <ListBoard
                      results={dayResults}
                      selectedId={selected?.id ?? null}
                      onSelect={setSelectedId}
                    />
                  )}
                </div>
                <DetailPane result={selected} onWatch={() => setPlaying(true)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <MediaPlayerModal
        open={Boolean(playingResult?.recording)}
        title={playingResult?.job.title ?? "Recording"}
        subtitle={
          playingResult ? `${playingResult.bidder.name} · ${playingResult.job.company}` : undefined
        }
        src={playingResult?.recording?.previewUrl ?? null}
        pathHint={playingResult?.recording?.storagePath}
        onClose={() => setPlaying(false)}
      />
    </PageShell>
  );
}

export default BidManagementPage;
