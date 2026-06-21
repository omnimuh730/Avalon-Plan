import React, { useEffect, useState } from "react";
import {
  Briefcase,
  Building2,
  Clock,
  ExternalLink,
  GraduationCap,
  MapPin,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import { Av, Badge, Score } from "../../../components/ui";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Separator } from "../../../components/ui/separator";
import { Skeleton } from "../../../components/ui/skeleton";
import { cn } from "../../../lib/utils";
import { bodyAsListItems, parseJobDescription } from "../../../lib/parseJobDescription";
import type { Job, WorkMode } from "../../../types";
import { useJobDetail } from "../hooks/useJobDetail";
import { useJobResumeRank, useJobSkillRadar } from "../hooks/useJobSkillRadar";
import { JobSkillMatchPanel } from "./JobSkillMatchPanel";
import { JobStatusActions } from "./JobStatusActions";

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

type JobDescriptionDialogProps = {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusPending?: boolean;
  onApply?: () => void;
  onMarkScheduled?: () => void;
  onMarkDeclined?: () => void;
  onMarkApplied?: () => void;
};

function CompanyLogo({ job }: { job: Job }) {
  const [failed, setFailed] = useState(false);

  if (failed || !job.logoUrl) {
    return <Av name={job.company} size="md" />;
  }

  return (
    <Avatar className="size-12 ring-2 ring-border/60 shadow-sm">
      <AvatarImage src={job.logoUrl} alt={`${job.company} logo`} onError={() => setFailed(true)} />
      <AvatarFallback className="p-0">
        <Av name={job.company} size="md" />
      </AvatarFallback>
    </Avatar>
  );
}

function MetaChip({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground">
      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      {children}
    </span>
  );
}

function SectionBlock({ title, body }: { title: string; body: string }) {
  const items = bodyAsListItems(body);

  return (
    <section className="space-y-2.5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary">{title}</h4>
      {items ? (
        <ul className="space-y-2 pl-1">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{body}</p>
      )}
    </section>
  );
}

function DescriptionSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[92%]" />
      <Skeleton className="h-4 w-[88%]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[75%]" />
    </div>
  );
}

function JobDescriptionBody({ job, loading }: { job: Job; loading: boolean }) {
  if (loading) return <DescriptionSkeleton />;

  const { preamble, sections } = parseJobDescription(job.jobDescription);
  const hasStructuredSections = sections.length > 0;

  if (!hasStructuredSections) {
    return (
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{job.jobDescription}</p>
    );
  }

  return (
    <div className="space-y-6">
      {preamble ? (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{preamble}</p>
      ) : null}
      {sections.map((section) => (
        <SectionBlock key={section.title} title={section.title} body={section.body} />
      ))}
    </div>
  );
}

export function JobDescriptionDialog({
  job,
  open,
  onOpenChange,
  statusPending = false,
  onApply,
  onMarkScheduled,
  onMarkDeclined,
  onMarkApplied,
}: JobDescriptionDialogProps) {
  const { displayJob, loading, error } = useJobDetail(job, open);
  const j = displayJob ?? job;
  const [skillMatchOpen, setSkillMatchOpen] = useState(false);

  const jobId = j.backendId || j.id;
  const { data: resumeRank, loading: resumeRankLoading } = useJobResumeRank(jobId, open);
  const {
    data: radarData,
    loading: radarLoading,
    error: radarError,
    selectedResumeId,
    changeResume,
  } = useJobSkillRadar(jobId, open && skillMatchOpen, {
    recommendedResumeId: resumeRank?.recommendedResumeId ?? undefined,
    recommendedTechStack: resumeRank?.recommendedResumeTechStack ?? undefined,
  });

  useEffect(() => {
    if (!open) setSkillMatchOpen(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b border-border bg-gradient-to-br from-primary/[0.06] via-card to-card px-6 py-5 pr-12">
          <div className="flex items-start gap-4">
            <CompanyLogo job={j} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold leading-snug text-foreground">{j.title}</h2>
                  <a
                    href={j.companyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    <Building2 className="size-3.5 shrink-0" />
                    {j.company}
                    <ExternalLink className="size-3 shrink-0 opacity-60" />
                  </a>
                </div>
                <div className="shrink-0 mr-2">
                  <Score score={j.scores.overall} />
                </div>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {j.postedAgo || j.posted}
                </span>
                <span>·</span>
                <span>{j.source}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <MetaChip icon={MapPin}>{j.location}</MetaChip>
            <MetaChip icon={Wifi}>{WORK_MODE_LABELS[j.workMode]}</MetaChip>
            <MetaChip icon={Briefcase}>{j.type}</MetaChip>
            <MetaChip icon={GraduationCap}>{j.seniority}</MetaChip>
            {j.experience ? <MetaChip>{j.experience}</MetaChip> : null}
            {j.salary !== "Undisclosed" ? <MetaChip>{j.salary}</MetaChip> : null}
            {j.applicantsText ? (
              <MetaChip icon={Users}>{j.applicantsText}</MetaChip>
            ) : null}
          </div>

          {resumeRank?.recommendedResumeTechStack ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Best fit:{" "}
              <span className="font-semibold text-foreground">
                {resumeRank.recommendedResumeTechStack}
              </span>{" "}
              resume
            </p>
          ) : resumeRankLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Finding best resume match…</p>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 subtle-scroll space-y-6">
          {j.skills.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Required skills</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {j.skills.map((skill) => (
                  <Badge key={skill} v="violet">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          {j.industries.length > 0 ? (
            <section>
              <h3 className="mb-3 text-sm font-bold text-foreground">Company focus</h3>
              <div className="flex flex-wrap gap-1.5">
                {j.industries.map((tag) => (
                  <Badge key={tag} v="subtle">
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          {(j.skills.length > 0 || j.industries.length > 0) && <Separator />}

          {skillMatchOpen ? (
            <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="size-4 text-primary" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">AI skill match</h3>
                    <p className="text-xs text-muted-foreground">
                      Required skills vs your resume — graph bridges related skills
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSkillMatchOpen(false)}>
                  Hide
                </Button>
              </div>
              <JobSkillMatchPanel
                data={radarData}
                loading={radarLoading}
                error={radarError}
                selectedResumeId={selectedResumeId}
                onResumeChange={changeResume}
              />
            </section>
          ) : null}

          {skillMatchOpen ? <Separator /> : null}

          <section>
            <h3 className="mb-4 text-sm font-bold text-foreground">Job description</h3>
            {error ? (
              <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {error}. Showing available summary.
              </p>
            ) : null}
            <JobDescriptionBody job={j} loading={loading} />
          </section>
        </div>

        <DialogFooter className="border-t border-border bg-card px-6 py-4 sm:justify-between">
          <div className="hidden sm:flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className={cn("rounded-md px-2 py-0.5 border border-border/60 bg-secondary/40")}>
              Skill {j.scores.skill}
            </span>
            <span className="rounded-md px-2 py-0.5 border border-border/60 bg-secondary/40">
              Salary {j.scores.salary}
            </span>
            <span className="rounded-md px-2 py-0.5 border border-border/60 bg-secondary/40">
              Bid {j.scores.bidEst}
            </span>
            <span className="rounded-md px-2 py-0.5 border border-border/60 bg-secondary/40">
              Fresh {j.scores.freshness}
            </span>
          </div>
          <div className="flex w-full sm:w-auto items-center justify-end gap-2">
            <Button
              variant={skillMatchOpen ? "secondary" : "outline"}
              onClick={() => setSkillMatchOpen((v) => !v)}
            >
              <Sparkles className="size-4 text-primary" />
              Skill match
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {onApply ? (
              <JobStatusActions
                job={j}
                pending={statusPending}
                onApply={onApply}
                onMarkScheduled={() => onMarkScheduled?.()}
                onMarkDeclined={() => onMarkDeclined?.()}
                onMarkApplied={() => onMarkApplied?.()}
                size="default"
                showExternalLinkOnApply={false}
              />
            ) : (
              <Button asChild>
                <a href={j.applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply on company site
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
