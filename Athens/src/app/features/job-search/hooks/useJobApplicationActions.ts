import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/useApi";
import { useApplier } from "@/context/applier-context";
import { API_BASE } from "@/lib/api-base";
import { JOB_STATUS_TO_API } from "../../../api/jobs";
import { mapDocToJob } from "../../../lib/job-adapters";
import type { Job, JobStatus } from "../../../types";

type JobMutationResponse = {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
};

export function useJobApplicationActions(
  onJobUpdated: (job: Job) => void,
  refreshStatusCounts: () => void | Promise<void>,
) {
  const { post } = useApi(API_BASE);
  const { applier } = useApplier();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const setPending = useCallback((jobId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }, []);

  const isPending = useCallback((jobId: string) => pendingIds.has(jobId), [pendingIds]);

  const applyToJob = useCallback(
    async (job: Job, { openUrl = true }: { openUrl?: boolean } = {}) => {
      const jobId = job.backendId || job.id;
      if (!applier?.name) {
        toast.error("Select a profile before applying");
        return;
      }

      setPending(jobId, true);
      try {
        if (openUrl && job.applyUrl && job.applyUrl !== "#") {
          window.open(job.applyUrl, "_blank", "noopener,noreferrer");
        }

        const res = (await post(`/jobs/${jobId}/apply`, {
          applierName: applier.name,
        })) as JobMutationResponse;

        if (res?.success && res.data) {
          onJobUpdated(mapDocToJob(res.data, applier));
          await refreshStatusCounts();
          if (res.message !== "User has already applied") {
            toast.success("Marked as applied");
          }
        }
      } catch {
        toast.error("Failed to mark job as applied");
      } finally {
        setPending(jobId, false);
      }
    },
    [applier, onJobUpdated, post, refreshStatusCounts, setPending],
  );

  const updateJobStatus = useCallback(
    async (job: Job, status: Exclude<JobStatus, "posted">) => {
      const jobId = job.backendId || job.id;
      if (!applier?.name) {
        toast.error("Select a profile before updating status");
        return;
      }

      setPending(jobId, true);
      try {
        const res = (await post(`/jobs/${jobId}/status`, {
          applierName: applier.name,
          status: JOB_STATUS_TO_API[status],
        })) as JobMutationResponse;

        if (res?.success && res.data) {
          onJobUpdated(mapDocToJob(res.data, applier));
          await refreshStatusCounts();
          toast.success(`Marked as ${status}`);
        }
      } catch {
        toast.error("Failed to update job status");
      } finally {
        setPending(jobId, false);
      }
    },
    [applier, onJobUpdated, post, refreshStatusCounts, setPending],
  );

  const cancelJobStatus = useCallback(
    async (job: Job) => {
      const jobId = job.backendId || job.id;
      if (!applier?.name) {
        toast.error("Select a profile before updating status");
        return;
      }

      setPending(jobId, true);
      try {
        let res: JobMutationResponse;

        if (job.status === "applied") {
          res = (await post(`/jobs/${jobId}/unapply`, {
            applierName: applier.name,
          })) as JobMutationResponse;
        } else if (job.status === "scheduled" || job.status === "declined") {
          res = (await post(`/jobs/${jobId}/status`, {
            applierName: applier.name,
            status: JOB_STATUS_TO_API.applied,
          })) as JobMutationResponse;
        } else {
          return;
        }

        if (res?.success && res.data) {
          onJobUpdated(mapDocToJob(res.data, applier));
          await refreshStatusCounts();
          toast.success(job.status === "applied" ? "Application removed" : "Moved back to Applied");
        }
      } catch {
        toast.error("Failed to cancel status");
      } finally {
        setPending(jobId, false);
      }
    },
    [applier, onJobUpdated, post, refreshStatusCounts, setPending],
  );

  return {
    applyToJob,
    updateJobStatus,
    cancelJobStatus,
    isPending,
  };
}
