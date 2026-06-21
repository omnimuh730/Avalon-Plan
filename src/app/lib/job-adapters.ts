import { calculateJobScores, combineSubScores } from "../../../../FoxHire/configs/jobScore.js";
import { inferJobSource } from "../../../../FoxHire/configs/pub.js";
import type { ApplierAccount } from "@/context/applier-context";
import type { Job, JobStatus, WorkMode } from "../types";

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
  return "new";
}

function parseWorkMode(remote: string): WorkMode {
  const r = remote.toLowerCase();
  if (r.includes("remote")) return "remote";
  if (r.includes("hybrid")) return "hybrid";
  return "onsite";
}

export function mapDocToJob(
  doc: Record<string, unknown>,
  applier: ApplierAccount | null,
  userSkills: string[] = [],
): Job {
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

  const storedSkill =
    typeof doc.skillScore === "number" && !Number.isNaN(doc.skillScore) ? doc.skillScore : null;
  const jsScores = calculateJobScores(doc, storedSkill === null ? userSkills : []);
  const skill = storedSkill ?? jsScores.skillMatch;
  const overall =
    typeof doc._score === "number" && !Number.isNaN(doc._score)
      ? Math.round(doc._score)
      : combineSubScores({
          skill,
          applicant: jsScores.applicantScore,
          freshness: jsScores.postedDateScore,
          salary: jsScores.salaryScore,
        });

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
      salary: jsScores.salaryScore ?? 0,
      bidEst: jsScores.applicantScore,
      freshness: jsScores.postedDateScore,
    },
    matchScore: overall,
    posted,
    postedAt,
    salary,
    source,
    jobDescription: String(doc.description || `${title} at ${company.name || "company"}.`),
    applyUrl,
    skillAnalysis,
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
