import React from "react";
import { CalendarCheck, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { Job } from "../../../types";

type JobStatusActionsProps = {
  job: Job;
  pending?: boolean;
  onApply: () => void;
  onMarkScheduled: () => void;
  onMarkDeclined: () => void;
  onMarkApplied: () => void;
  size?: "sm" | "default";
  showExternalLinkOnApply?: boolean;
};

export function JobStatusActions({
  job,
  pending = false,
  onApply,
  onMarkScheduled,
  onMarkDeclined,
  onMarkApplied,
  size = "sm",
  showExternalLinkOnApply = true,
}: JobStatusActionsProps) {
  if (job.status === "posted") {
    return (
      <Button size={size} disabled={pending} onClick={onApply}>
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Apply
        {showExternalLinkOnApply ? <ExternalLink className="w-4 h-4" /> : null}
      </Button>
    );
  }

  if (job.status === "applied") {
    return (
      <>
        <Button size={size} variant="outline" disabled={pending} onClick={onMarkScheduled}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
          Scheduled
        </Button>
        <Button
          size={size}
          variant="outline"
          className="text-rose-600 hover:text-rose-700"
          disabled={pending}
          onClick={onMarkDeclined}
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Declined
        </Button>
      </>
    );
  }

  if (job.status === "scheduled") {
    return (
      <>
        <Button size={size} variant="outline" disabled={pending} onClick={onMarkApplied}>
          Applied
        </Button>
        <Button
          size={size}
          variant="outline"
          className="text-rose-600 hover:text-rose-700"
          disabled={pending}
          onClick={onMarkDeclined}
        >
          Declined
        </Button>
      </>
    );
  }

  if (job.status === "declined") {
    return (
      <>
        <Button size={size} variant="outline" disabled={pending} onClick={onMarkApplied}>
          Applied
        </Button>
        <Button size={size} variant="outline" disabled={pending} onClick={onMarkScheduled}>
          Scheduled
        </Button>
      </>
    );
  }

  return null;
}
