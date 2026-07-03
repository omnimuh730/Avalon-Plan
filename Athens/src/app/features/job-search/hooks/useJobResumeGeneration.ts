import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApplier } from "@/context/applier-context";
import {
  fetchJobDescription,
  fetchJobsWithGeneratedResumes,
  generateJobResumeStream,
} from "../../../api/jobs";
import type { Job } from "../../../types";

/** Max résumés generated concurrently during a bulk run (rate-limit guard). */
const MAX_CONCURRENT_GENERATIONS = 10;

export type JobResumeGenerationStatus = "generating" | "done" | "error";

export type JobResumeGenerationState = {
  status: JobResumeGenerationStatus;
  /** Live step label while generating (from the SSE stream). */
  step?: string | null;
  /** True when the server reused a previously generated résumé. */
  reused?: boolean;
  error?: string;
};

/**
 * Pre-generate tailored résumés from Job Search via the same Resume Generator
 * pipeline the Agents page uses (`generateJobResumeStream`). Generated résumés
 * are cached server-side per job, so the Agents pipeline reuses them.
 *
 * Jobs that already have a résumé (checked in batch on page load) are marked
 * "done" and skipped by both single and bulk generation.
 */
export function useJobResumeGeneration(jobs: Job[]) {
  const { applier } = useApplier();
  const [resumeStates, setResumeStates] = useState<Record<string, JobResumeGenerationState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const inflightRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const bulkCancelledRef = useRef(false);
  const resumeStatesRef = useRef(resumeStates);
  resumeStatesRef.current = resumeStates;

  const patchState = useCallback((jobId: string, state: JobResumeGenerationState) => {
    setResumeStates((prev) => ({ ...prev, [jobId]: state }));
  }, []);

  // Pre-mark jobs whose résumé was already generated (this session or a prior
  // one) so the UI shows "Ready" and generation skips them.
  useEffect(() => {
    if (!applier?.name || jobs.length === 0) return;
    const applierName = applier.name;
    const idsByBackendId = new Map(jobs.map((job) => [job.backendId || job.id, job.id]));
    let cancelled = false;
    void fetchJobsWithGeneratedResumes(applierName, [...idsByBackendId.keys()]).then((existing) => {
      if (cancelled || existing.size === 0) return;
      setResumeStates((prev) => {
        const next = { ...prev };
        for (const backendId of existing) {
          const jobId = idsByBackendId.get(backendId);
          // Don't clobber an in-flight or failed state from this session.
          if (jobId && !next[jobId]) next[jobId] = { status: "done", reused: true };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [applier?.name, jobs]);

  /** Generate (or reuse) a résumé for one job. Resolves true on success. */
  const generateForJob = useCallback(
    (job: Job, options?: { silent?: boolean }): Promise<boolean> => {
      // Already generated (this session or found on the server) — nothing to do.
      if (resumeStatesRef.current[job.id]?.status === "done") return Promise.resolve(true);
      const inflight = inflightRef.current.get(job.id);
      if (inflight) return inflight;

      const promise = (async () => {
        if (!applier?.name) {
          if (!options?.silent) toast.error("Select a profile before generating résumés");
          return false;
        }
        const backendId = job.backendId || job.id;
        patchState(job.id, { status: "generating", step: "Fetching job description…" });
        try {
          const jd = await fetchJobDescription(backendId);
          if (!jd) throw new Error("No job description saved for this job");
          const gen = await generateJobResumeStream(
            { applierName: applier.name, jobId: backendId, jobDescription: jd },
            (progress) => {
              if (progress.stepLabel) {
                patchState(job.id, { status: "generating", step: progress.stepLabel });
              }
            },
          );
          patchState(job.id, { status: "done", reused: gen.reused });
          if (!options?.silent) {
            toast.success(`Résumé ${gen.reused ? "reused" : "generated"} for "${job.title}"`);
          }
          return true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Résumé generation failed";
          patchState(job.id, { status: "error", error: msg });
          if (!options?.silent) toast.error(`"${job.title}": ${msg}`);
          return false;
        } finally {
          inflightRef.current.delete(job.id);
        }
      })();

      inflightRef.current.set(job.id, promise);
      return promise;
    },
    [applier, patchState],
  );

  /** Generate résumés for many jobs, at most MAX_CONCURRENT_GENERATIONS at a time. */
  const generateBulk = useCallback(
    async (selected: Job[]) => {
      if (bulkRunning || selected.length === 0) return;
      if (!applier?.name) {
        toast.error("Select a profile before generating résumés");
        return;
      }

      const alreadyDone = selected.filter((job) => resumeStatesRef.current[job.id]?.status === "done").length;
      const jobs = selected.filter((job) => resumeStatesRef.current[job.id]?.status !== "done");
      if (jobs.length === 0) {
        toast.info(
          `All ${selected.length} selected job${selected.length === 1 ? " already has" : "s already have"} a résumé`,
        );
        return;
      }
      if (alreadyDone > 0) {
        toast.info(`Skipping ${alreadyDone} job${alreadyDone === 1 ? "" : "s"} with an existing résumé`);
      }

      bulkCancelledRef.current = false;
      setBulkRunning(true);
      setBulkProgress({ done: 0, total: jobs.length });

      let succeeded = 0;
      let failed = 0;
      let nextIndex = 0;

      const worker = async () => {
        while (!bulkCancelledRef.current) {
          const index = nextIndex++;
          if (index >= jobs.length) return;
          const ok = await generateForJob(jobs[index], { silent: true });
          if (ok) succeeded++;
          else failed++;
          setBulkProgress({ done: succeeded + failed, total: jobs.length });
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(MAX_CONCURRENT_GENERATIONS, jobs.length) }, worker),
        );
      } finally {
        setBulkRunning(false);
        setBulkProgress(null);
      }

      const skipped = jobs.length - succeeded - failed;
      if (bulkCancelledRef.current && skipped > 0) {
        toast.info(`Résumé generation stopped · ${succeeded} done, ${failed} failed, ${skipped} skipped`);
      } else if (failed > 0) {
        toast.warning(`Résumés generated for ${succeeded}/${jobs.length} jobs (${failed} failed)`);
      } else {
        toast.success(`Résumés ready for ${succeeded} job${succeeded === 1 ? "" : "s"}`);
      }
    },
    [applier, bulkRunning, generateForJob],
  );

  /** Stop the bulk run after in-flight generations finish. */
  const cancelBulk = useCallback(() => {
    bulkCancelledRef.current = true;
  }, []);

  return {
    resumeStates,
    generateForJob,
    generateBulk,
    cancelBulk,
    bulkRunning,
    bulkProgress,
  };
}
