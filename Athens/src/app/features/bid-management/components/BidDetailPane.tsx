import type { ComponentType, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clapperboard,
  Play,
  ExternalLink,
  Circle,
  CheckCircle2,
  Clock,
  Film,
  Lock,
  FileText,
  CalendarDays,
  Briefcase,
  MapPin,
  Banknote,
  Sparkles,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { AgentResumePdfPreview } from "../../agents/components/AgentResumePdfPreview";
import { useApplier } from "@/context/applier-context";
import type { BidResult, BidResultStatus, FlagLight } from "../types";
import { EDITABLE_STATUSES, isEditableStatus } from "../types";
import { STATUS_LABELS, formatDuration, formatWhen } from "../mockData";
import { useBidPreview } from "../hooks/useBidPreview";

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

function MetaChip({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="bm-meta-chip">
      <Icon className="w-3 h-3" />
      {children}
    </span>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="bm-section">
      <div className="bm-section-head">
        <div className="bm-eyebrow">{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function BidDetailPane({
  result,
  onWatch,
  onChangeStatus,
}: {
  result: BidResult | null;
  onWatch: () => void;
  onChangeStatus: (id: string, status: BidResultStatus) => void;
}) {
  const { applier } = useApplier();
  const preview = useBidPreview(result?.jobId ?? null, result?.bidder.name);

  if (!result) {
    return (
      <div className="bm-detail empty">
        <Clapperboard className="w-9 h-9 opacity-30 mb-3" />
        <p>Select a bid ticket to review details and recording</p>
      </div>
    );
  }

  const editable = isEditableStatus(result.status);
  const detail = preview.jobDetail || result.jobDetail;
  const recommended = preview.recommendedResume || result.recommendedResume;
  const submission = result.submissionResume;
  const desc = detail?.description?.trim() || "";
  const posted =
    detail?.postedLabel ||
    (detail?.postedAt ? formatWhen(detail.postedAt) : null) ||
    formatWhen(result.pooledAt);

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
        <div className="bm-detail-sticky">
          <div className="bm-detail-head">
            <div>
              <div className="bm-eyebrow">
                {result.status === "pending" ? "Bid ready" : "Bid result"}
              </div>
              <h2 className="bm-detail-title">{result.job.title}</h2>
              <p className="bm-detail-sub">
                {result.job.company} · {result.job.location}
              </p>
            </div>
            {editable ? (
              <select
                className="bm-status-select"
                value={result.status}
                aria-label="Edit status"
                onChange={(e) => onChangeStatus(result.id, e.target.value as BidResultStatus)}
              >
                {EDITABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : (
              <div className="bm-status-locked">
                <StatusPill status={result.status} />
                <span className="bm-lock-hint">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              </div>
            )}
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

          <div className="bm-chip-wrap">
            <FlagDot label="Remote" value={result.flags.remote} />
            <FlagDot label="No clearance" value={result.flags.clearance} />
            {detail?.workMode ? <MetaChip icon={MapPin}>{detail.workMode}</MetaChip> : null}
            {detail?.salary ? <MetaChip icon={Banknote}>{detail.salary}</MetaChip> : null}
            {posted ? <MetaChip icon={CalendarDays}>{posted}</MetaChip> : null}
            {detail?.seniority ? <MetaChip icon={Briefcase}>{detail.seniority}</MetaChip> : null}
            {result.durationSec != null ? (
              <MetaChip icon={Clock}>{formatDuration(result.durationSec)}</MetaChip>
            ) : null}
          </div>
        </div>

        <div className="bm-detail-scroll subtle-scroll">
          {preview.loading ? (
            <div className="bm-preview-loading">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading job details…
            </div>
          ) : null}
          {preview.error ? <div className="bm-preview-error">{preview.error}</div> : null}

          <Section title="Job overview">
            <div className="bm-overview-grid">
              <div>
                <div className="bm-kv-label">Source</div>
                <div className="bm-kv-val">{result.job.source}</div>
              </div>
              <div>
                <div className="bm-kv-label">Posted</div>
                <div className="bm-kv-val">{posted || "—"}</div>
              </div>
              <div>
                <div className="bm-kv-label">Type</div>
                <div className="bm-kv-val">{detail?.employmentType || "—"}</div>
              </div>
              <div>
                <div className="bm-kv-label">Experience</div>
                <div className="bm-kv-val">{detail?.experience || "—"}</div>
              </div>
              {detail?.applicantsText ? (
                <div className="bm-overview-span">
                  <div className="bm-kv-label">Applicants</div>
                  <div className="bm-kv-val">{detail.applicantsText}</div>
                </div>
              ) : null}
            </div>
            {detail?.skills?.length ? (
              <div className="bm-skill-row">
                {detail.skills.slice(0, 12).map((s) => (
                  <span key={s} className="bm-skill-pill">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </Section>

          <Section title="Job description">
            {desc ? (
              <div className="bm-desc">{desc}</div>
            ) : (
              <div className="bm-empty-inline">No description available</div>
            )}
          </Section>

          {editable && submission ? (
            <Section title="Résumé used for submission">
              <div className="bm-resume-card used">
                <div className="bm-resume-icon">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="bm-resume-body">
                  <div className="bm-resume-name">{submission.name}</div>
                  <div className="bm-resume-meta">
                    {submission.techStack || "Tailored stack"}
                    {submission.source ? ` · ${submission.source}` : ""}
                    {submission.scorePercent != null ? ` · ${submission.scorePercent}% match` : ""}
                  </div>
                  {submission.fileName ? (
                    <div className="bm-resume-file">{submission.fileName}</div>
                  ) : null}
                  {submission.usedAt ? (
                    <div className="bm-resume-file">Submitted {formatWhen(submission.usedAt)}</div>
                  ) : null}
                </div>
              </div>
            </Section>
          ) : null}

          <Section
            title={editable ? "Generated / recommended résumé" : "Generated résumé"}
            action={
              preview.hasGeneratedPdf ? (
                <span className="bm-resume-badge">
                  <Sparkles className="w-3 h-3" />
                  PDF ready
                </span>
              ) : null
            }
          >
            {recommended || preview.hasGeneratedPdf ? (
              <div className="bm-resume-card">
                <div className="bm-resume-icon">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="bm-resume-body">
                  <div className="bm-resume-name">
                    {recommended?.name || "Generated résumé for this job"}
                  </div>
                  <div className="bm-resume-meta">
                    {recommended?.techStack || "Tailored draft"}
                    {recommended?.scorePercent != null ? ` · ${recommended.scorePercent}% match` : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bm-empty-inline">No generated résumé yet for this job</div>
            )}
            {preview.hasGeneratedPdf && result.jobId ? (
              <div className="bm-pdf-frame">
                <AgentResumePdfPreview
                  applierName={applier?.name || result.bidder.name}
                  jobId={result.jobId}
                  className="bm-pdf-iframe"
                />
              </div>
            ) : null}
          </Section>

          <Section title="Timeline">
            <ol className="bm-timeline-list">
              <li className="done">
                <CheckCircle2 className="w-4 h-4" />
                <div>
                  <strong>{result.status === "pending" ? "Bid ready" : "Pooled"}</strong>
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
          </Section>

          {result.notes ? (
            <Section title="Notes">
              <div className="bm-notes-box">{result.notes}</div>
            </Section>
          ) : null}

          {!editable && (
            <div className="bm-locked-banner">
              <Lock className="w-3.5 h-3.5" />
              {result.status === "pending"
                ? "Pending (Bid ready) status can’t be edited here — mark progress from Job Search / bidder flow."
                : "In-Process tickets are locked until the bidder submits."}
            </div>
          )}

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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
