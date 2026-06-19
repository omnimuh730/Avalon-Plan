import React, { useState } from "react";
import {
  Bookmark,
  Building2,
  ExternalLink,
  FileText,
  MapPin,
  Wifi,
} from "lucide-react";
import { Av, Badge, Score } from "../../../components/ui";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { cn, mono } from "../../../lib/utils";
import type { BadgeVariant, Job } from "../../../types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  new: "blue",
  applied: "success",
  scheduled: "amber",
  declined: "err",
};

const WORK_MODE_LABELS: Record<Job["workMode"], string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

type JobCardProps = {
  job: Job;
  className?: string;
  selected?: boolean;
  onToggleSelect?: () => void;
  showScores?: boolean;
};

function CompanyLogo({ job }: { job: Job }) {
  const [failed, setFailed] = useState(false);

  if (failed || !job.logoUrl) {
    return <Av name={job.company} size="sm" />;
  }

  return (
    <Avatar className="size-9">
      <AvatarImage src={job.logoUrl} alt={`${job.company} logo`} onError={() => setFailed(true)} />
      <AvatarFallback className="p-0">
        <Av name={job.company} size="sm" />
      </AvatarFallback>
    </Avatar>
  );
}

function InfoChip({ children }: { children: React.ReactNode }) {
  return <Badge v="subtle">{children}</Badge>;
}

function MiniScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-secondary/60 border border-border/60 min-w-[52px]">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold text-foreground tabular-nums" style={mono}>
        {value}
      </span>
    </div>
  );
}

export function JobCard({
  job,
  className,
  selected,
  onToggleSelect,
  showScores = true,
}: JobCardProps) {
  const [jdOpen, setJdOpen] = useState(false);
  const [saved, setSaved] = useState(job.status === "new");

  return (
    <>
      <article
        className={cn(
          "group bg-card border rounded-xl p-5 hover:shadow-md transition-all shadow-sm flex flex-col gap-4",
          selected ? "border-primary/50 ring-2 ring-primary/15 bg-primary/[0.02]" : "border-border",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              className="mt-2 size-4 rounded border-border text-primary focus:ring-primary/30 shrink-0"
              aria-label={`Select ${job.title}`}
            />
          )}
          <CompanyLogo job={job} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground leading-tight truncate">{job.title}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                  <a
                    href={job.companyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {job.company}
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                  </a>
                  <span className="text-xs text-muted-foreground">· {job.posted}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Score score={job.scores.overall} />
                <Badge v={STATUS_VARIANTS[job.status]}>{job.status}</Badge>
              </div>
            </div>
          </div>
        </div>

        {showScores && (
          <div className="flex flex-wrap gap-2">
            <MiniScore label="Skill" value={job.scores.skill} />
            <MiniScore label="Salary" value={job.scores.salary} />
            <MiniScore label="Bid" value={job.scores.bidEst} />
            <MiniScore label="Fresh" value={job.scores.freshness} />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {job.industries.map((industry) => (
            <Badge key={industry} v="blue">
              {industry}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <InfoChip>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {job.location}
            </span>
          </InfoChip>
          <InfoChip>
            <span className="inline-flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              {WORK_MODE_LABELS[job.workMode]}
            </span>
          </InfoChip>
          <InfoChip>{job.type}</InfoChip>
          <InfoChip>{job.seniority}</InfoChip>
          <InfoChip>{job.salary}</InfoChip>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
          <span className="text-xs text-muted-foreground truncate">{job.source}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setJdOpen(true)}>
              <FileText className="w-4 h-4" />
              View JD
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={saved ? "Unsave" : "Save job"}
              onClick={() => setSaved((s) => !s)}
            >
              <Bookmark className={cn("w-4 h-4", saved && "fill-current text-primary")} />
            </Button>
            <Button size="sm" asChild>
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                Apply
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </div>
      </article>

      <Dialog open={jdOpen} onOpenChange={setJdOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{job.title}</DialogTitle>
            <DialogDescription>
              {job.company} · {job.location} · {job.posted}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
            {job.jobDescription}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJdOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                Apply on company site
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
