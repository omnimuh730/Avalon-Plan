import { inferJobSource } from '@/app/data/jobs/pub';
import type { ApplierAccount } from "@/context/applier-context";
import type { Job, JobStatus, WorkMode } from "../types/job";

function readScore(doc: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = doc[key];
    if (typeof v === "number" && !Number.isNaN(v)) return Math.round(v);
  }
  return null;
}

function freshnessFromPosted(doc: Record<string, unknown>): number {
  const postedRaw = String(doc.postedAt || doc._createdAt || "");
  if (!postedRaw) return 50;
  const postedMs = new Date(postedRaw).getTime();
  if (Number.isNaN(postedMs)) return 50;
  const ageDays = Math.max(0, (Date.now() - postedMs) / 86400000);
  return Math.max(0, Math.min(100, Math.round(100 - Math.min(ageDays, 30) * 3)));
}

export function normalizeId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "$oid" in value) {
    return String((value as { $oid: string }).$oid);
  }
  return String(value);
}

function resolveStatusForApplier(
  statusArr: unknown[] | undefined,
  applierId: string | null,
): "applied" | "scheduled" | "declined" | "none" {
  if (!Array.isArray(statusArr) || !applierId) return "none";
  for (const s of statusArr) {
    if (!s || typeof s !== "object") continue;
    const row = s as Record<string, unknown>;
    if (normalizeId(row.applier) !== applierId) continue;
    if (row.declinedDate) return "declined";
    if (row.scheduledDate) return "scheduled";
    if (row.appliedDate) return "applied";
  }
  return "none";
}

function mapApiStatusToJob(st: "applied" | "scheduled" | "declined" | "none"): JobStatus {
  if (st === "declined") return "declined";
  if (st === "scheduled") return "scheduled";
  if (st === "applied") return "applied";
  return "posted";
}

function parseWorkMode(remote: string): WorkMode {
  const r = remote.toLowerCase();
  if (r.includes("remote")) return "remote";
  if (r.includes("hybrid")) return "hybrid";
  return "onsite";
}

export function mapDocToJob(doc: Record<string, unknown>, applier: ApplierAccount | null): Job {
  const backendId = normalizeId(doc._id);
  const company = (doc.company as { name?: string; tags?: string[]; logo?: string } | undefined) || {};
  const details = (doc.details as Record<string, string | undefined> | undefined) || {};
  const title = String(doc.title || "Untitled role");

  const rawLogo = typeof company.logo === "string" ? company.logo.trim() : "";
  let logoUrl: string | undefined;
  if (/^https?:\/\//i.test(rawLogo)) logoUrl = rawLogo;
  else if (rawLogo.startsWith("//")) logoUrl = `https:${rawLogo}`;

  const companyLinkRaw = typeof doc.companyLink === "string" ? doc.companyLink.trim() : "";
  const companyUrl = /^https?:\/\//i.test(companyLinkRaw) ? companyLinkRaw : "#";

  const industries = Array.isArray(company.tags) ? company.tags.map(String) : ["General"];
  const applierId = applier?._id != null ? normalizeId(applier._id) : null;
  const st = resolveStatusForApplier(doc.status as unknown[] | undefined, applierId);
  const status = mapApiStatusToJob(st);

  const location = String(details.position || "—");
  const workMode = parseWorkMode(String(details.remote || ""));
  const type = String(details.time || "Full-time");
  const seniority = String(details.seniority || "—");
  const salary = String(details.money || "Undisclosed");
  const postedRaw = String(doc.postedAt || doc._createdAt || "");
  const postedAt = postedRaw ? postedRaw.slice(0, 10) : "";
  const posted = postedRaw ? new Date(postedRaw).toLocaleString() : "—";
  const applyUrl = String(doc.applyLink || "#");
  const source =
    typeof doc.source === "string" && doc.source ? doc.source : inferJobSource(String(doc.applyLink || ""));

  const skill = readScore(doc, "scoreSkill", "matchScore", "skillScore") ?? 0;
  const overall = readScore(doc, "_score", "scoreOverall") ?? skill;
  const salaryScore = readScore(doc, "scoreSalary") ?? 0;
  const bidEst = readScore(doc, "scoreApplicant") ?? 0;
  const freshness = readScore(doc, "scoreFreshness") ?? freshnessFromPosted(doc);

  const bestResumeTechStack =
    typeof doc.bestResumeTechStack === "string" && doc.bestResumeTechStack.trim()
      ? doc.bestResumeTechStack.trim()
      : undefined;

  const skillAnalysis =
    doc.skillAnalysis && typeof doc.skillAnalysis === "object"
      ? (doc.skillAnalysis as Job["skillAnalysis"])
      : undefined;

  return {
    id: backendId,
    backendId,
    title,
    company: String(company.name || "Unknown"),
    companyUrl,
    logoUrl,
    location,
    workMode,
    type,
    seniority,
    industries,
    status,
    scores: {
      overall,
      skill,
      salary: salaryScore,
      bidEst,
      freshness,
    },
    matchScore: overall,
    posted,
    postedAt,
    salary,
    source,
    jobDescription: String(doc.description || `${title} at ${company.name || "company"}.`),
    applyUrl,
    skillAnalysis,
    bestResumeTechStack,
  };
}

export const SORT_TO_API: Record<string, string> = {
  newest: "postedAt_desc",
  matchScore: "recommended",
  skill: "recommended",
  salary: "salary_desc",
  freshness: "postedAt_desc",
  title: "postedAt_desc",
};
