import type {
  BidResult,
  BidResultKpis,
  BidResultStatus,
  DateFolder,
  PeriodPreset,
} from "./types";
import { BID_STATUSES } from "./types";

/**
 * Mock bid outcomes for the Bid Management UI.
 * Replace `loadMockBidResults()` with `GET /api/bid-results` that joins
 * vendor_tasks + bid sessions + Storage listing under bid-recordings/…
 */

const SAMPLE_WEBM =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm";
const SAMPLE_MP4 =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atDay(daysAgo: number, hour = 10, minute = 0): { iso: string; dayKey: string } {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return { iso: d.toISOString(), dayKey: dayKeyFromDate(d) };
}

function later(baseIso: string, hours: number): string {
  return new Date(new Date(baseIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export const MOCK_BID_RESULTS: BidResult[] = [
  {
    id: "br-1001",
    dayKey: atDay(0).dayKey,
    job: {
      title: "Senior Full-Stack Engineer",
      company: "Northwind Labs",
      location: "Remote · US",
      source: "LinkedIn",
      applyUrl: "https://www.linkedin.com/jobs/view/mock-1001",
    },
    bidder: { name: "Alex Chen", avatarInitials: "AC" },
    status: "reviewed",
    pooledAt: atDay(0, 9).iso,
    submittedAt: later(atDay(0, 9).iso, 4),
    durationSec: 742,
    matchScore: 91,
    flags: { remote: "green", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/4654e799-afa6-4a13-b855-c961ad000482/007482f5-bdfd-49ef-b6a5-a63c29a7a3ca/rec-1784140222908-sov79o.webm",
      contentType: "video/webm;codecs=vp9",
      sizeBytes: 2_704_142,
      previewUrl: SAMPLE_WEBM,
    },
    notes: "Easy Apply completed. Resume renamed to match stack recommendation.",
  },
  {
    id: "br-1002",
    dayKey: atDay(0).dayKey,
    job: {
      title: "Frontend Engineer (React)",
      company: "Lumen Craft",
      location: "Remote · Worldwide",
      source: "Greenhouse",
      applyUrl: "https://boards.greenhouse.io/lumencraft/jobs/mock-1003",
    },
    bidder: { name: "Sam Rivera", avatarInitials: "SR" },
    status: "in_process",
    pooledAt: atDay(0, 11).iso,
    submittedAt: null,
    durationSec: null,
    matchScore: 78,
    flags: { remote: "green", clearance: "green" },
    recording: null,
    notes: "Bidder currently on the application form.",
  },
  {
    id: "br-1003",
    dayKey: atDay(0).dayKey,
    job: {
      title: "DevOps Engineer",
      company: "Orbit Mesh",
      location: "Remote · US",
      source: "LinkedIn",
      applyUrl: "https://www.linkedin.com/jobs/view/mock-1005",
    },
    bidder: { name: "Morgan Patel", avatarInitials: "MP" },
    status: "pending",
    pooledAt: atDay(0, 14).iso,
    submittedAt: null,
    durationSec: null,
    matchScore: 72,
    flags: { remote: "green", clearance: null },
    recording: null,
    notes: "Waiting for next available bidder slot.",
  },
  {
    id: "br-1004",
    dayKey: atDay(1).dayKey,
    job: {
      title: "Staff Platform Engineer",
      company: "Harbor Systems",
      location: "New York, NY",
      source: "Indeed",
      applyUrl: "https://www.indeed.com/viewjob?jk=mock-1002",
    },
    bidder: { name: "Jordan Lee", avatarInitials: "JL" },
    status: "reviewed",
    pooledAt: atDay(1, 8).iso,
    submittedAt: later(atDay(1, 8).iso, 6),
    durationSec: 1180,
    matchScore: 87,
    flags: { remote: "red", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/63181019-76dd-4637-b17a-c3dcf5f7c156/007d25c2-03dd-4f38-904a-b3cf5bccfdad/rec-1784136369178-s0t28j.webm",
      contentType: "video/webm",
      sizeBytes: 3_210_400,
      previewUrl: SAMPLE_WEBM,
    },
    notes: "Hybrid role — remote flag red as expected. Application confirmed.",
  },
  {
    id: "br-1005",
    dayKey: atDay(1).dayKey,
    job: {
      title: "Backend Engineer · Go",
      company: "Cascade Data",
      location: "Austin, TX",
      source: "Lever",
      applyUrl: "https://jobs.lever.co/cascadedata/mock-1004",
    },
    bidder: { name: "Alex Chen", avatarInitials: "AC" },
    status: "submitted",
    pooledAt: atDay(1, 12).iso,
    submittedAt: later(atDay(1, 12).iso, 3),
    durationSec: 540,
    matchScore: 84,
    flags: { remote: null, clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/6a3fc2f2-1f12-49d8-9737-d4060bf2f02a/01a06e38-b544-4a41-8f37-8b5e166db16d/rec-1784061857513-osq0t1.webm",
      contentType: "video/webm",
      sizeBytes: 1_890_220,
      previewUrl: SAMPLE_WEBM,
    },
    notes: null,
  },
  {
    id: "br-1006",
    dayKey: atDay(1).dayKey,
    job: {
      title: "iOS Engineer",
      company: "Brightline Apps",
      location: "Seattle, WA",
      source: "Indeed",
      applyUrl: "https://www.indeed.com/viewjob?jk=mock-1009",
    },
    bidder: { name: "Alex Chen", avatarInitials: "AC" },
    status: "pending",
    pooledAt: atDay(1, 16).iso,
    submittedAt: null,
    durationSec: null,
    matchScore: 69,
    flags: { remote: null, clearance: "green" },
    recording: null,
    notes: null,
  },
  {
    id: "br-1007",
    dayKey: atDay(2).dayKey,
    job: {
      title: "Product Engineer",
      company: "Fable Soft",
      location: "San Francisco, CA",
      source: "Ashby",
      applyUrl: "https://jobs.ashbyhq.com/fablesoft/mock-1007",
    },
    bidder: { name: "Sam Rivera", avatarInitials: "SR" },
    status: "submitted",
    pooledAt: atDay(2, 10).iso,
    submittedAt: later(atDay(2, 10).iso, 5),
    durationSec: 1310,
    matchScore: 88,
    flags: { remote: "red", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/63181019-76dd-4637-b17a-c3dcf5f7c156/02ae48ad-65c5-48eb-befd-a8e95f98a526/rec-1783974504144-no9cyr.webm",
      contentType: "video/mp4",
      sizeBytes: 4_120_800,
      previewUrl: SAMPLE_MP4,
    },
    notes: "Long form with custom questions — check suggested answers in recording.",
  },
  {
    id: "br-1008",
    dayKey: atDay(2).dayKey,
    job: {
      title: "Data Engineer",
      company: "Quill Analytics",
      location: "Chicago, IL",
      source: "Greenhouse",
      applyUrl: "https://boards.greenhouse.io/quill/jobs/mock-1010",
    },
    bidder: { name: "Jordan Lee", avatarInitials: "JL" },
    status: "in_process",
    pooledAt: atDay(2, 13).iso,
    submittedAt: null,
    durationSec: null,
    matchScore: 81,
    flags: { remote: "green", clearance: "green" },
    recording: null,
    notes: "Mid-application — form answers in progress.",
  },
  {
    id: "br-1009",
    dayKey: atDay(3).dayKey,
    job: {
      title: "ML Engineer",
      company: "Vector Peak",
      location: "Remote · EU",
      source: "LinkedIn",
      applyUrl: "https://www.linkedin.com/jobs/view/mock-1008",
    },
    bidder: { name: "Morgan Patel", avatarInitials: "MP" },
    status: "reviewed",
    pooledAt: atDay(3, 9).iso,
    submittedAt: later(atDay(3, 9).iso, 4),
    durationSec: 680,
    matchScore: 93,
    flags: { remote: "green", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/6a3fc2f2-1f12-49d8-9737-d4060bf2f02a/00233d99-d2aa-456b-915e-77f693110852/rec-1784044712246-mxh7o0.webm",
      contentType: "video/webm",
      sizeBytes: 2_100_500,
      previewUrl: SAMPLE_WEBM,
    },
    notes: "Strong skill match. Confirmation email captured at end of recording.",
  },
  {
    id: "br-1010",
    dayKey: atDay(4).dayKey,
    job: {
      title: "Security Engineer",
      company: "Redline Defense",
      location: "Washington, DC",
      source: "Workday",
      applyUrl: "https://redline.wd1.myworkdayjobs.com/mock-1006",
    },
    bidder: { name: "Jordan Lee", avatarInitials: "JL" },
    status: "rejected",
    pooledAt: atDay(4, 11).iso,
    submittedAt: later(atDay(4, 11).iso, 2),
    durationSec: 920,
    matchScore: 65,
    flags: { remote: "red", clearance: "red" },
    recording: {
      storagePath:
        "bid-recordings/4654e799-afa6-4a13-b855-c961ad000482/0237b557-60dd-4f2a-9b78-99febc7a26d9/rec-1784151171562-noznm1.webm",
      contentType: "video/webm",
      sizeBytes: 2_450_000,
      previewUrl: SAMPLE_MP4,
    },
    notes: "Clearance required — skipped mid-flow after screening lights.",
  },
  {
    id: "br-1011",
    dayKey: atDay(5).dayKey,
    job: {
      title: "SRE · Cloud",
      company: "Nimbus Ops",
      location: "Remote · US",
      source: "Lever",
      applyUrl: "https://jobs.lever.co/nimbus/mock-1011",
    },
    bidder: { name: "Sam Rivera", avatarInitials: "SR" },
    status: "submitted",
    pooledAt: atDay(5, 10).iso,
    submittedAt: later(atDay(5, 10).iso, 3),
    durationSec: 610,
    matchScore: 79,
    flags: { remote: "green", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/4654e799-afa6-4a13-b855-c961ad000482/01a06e38-b544-4a41-8f37-8b5e166db16d/rec-mock-1011.webm",
      contentType: "video/webm",
      sizeBytes: 2_050_000,
      previewUrl: SAMPLE_WEBM,
    },
    notes: null,
  },
  {
    id: "br-1012",
    dayKey: atDay(8).dayKey,
    job: {
      title: "Android Engineer",
      company: "Pixel Grove",
      location: "Los Angeles, CA",
      source: "Ashby",
      applyUrl: "https://jobs.ashbyhq.com/pixelgrove/mock-1012",
    },
    bidder: { name: "Morgan Patel", avatarInitials: "MP" },
    status: "reviewed",
    pooledAt: atDay(8, 9).iso,
    submittedAt: later(atDay(8, 9).iso, 5),
    durationSec: 890,
    matchScore: 86,
    flags: { remote: "red", clearance: "green" },
    recording: {
      storagePath:
        "bid-recordings/63181019-76dd-4637-b17a-c3dcf5f7c156/rec-mock-1012.webm",
      contentType: "video/webm",
      sizeBytes: 2_600_000,
      previewUrl: SAMPLE_WEBM,
    },
    notes: "Outside 7d window — still visible in 14d/30d/all.",
  },
];

/** Swap this for a real API client later. */
export function loadMockBidResults(): BidResult[] {
  return MOCK_BID_RESULTS;
}

export const STATUS_LABELS: Record<BidResultStatus, string> = {
  pending: "Pending",
  in_process: "In-Process",
  submitted: "Submitted",
  reviewed: "Reviewed",
  rejected: "Rejected",
};

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  all: "All time",
};

export function computeKpis(results: BidResult[]): BidResultKpis {
  const base: BidResultKpis = {
    pending: 0,
    in_process: 0,
    submitted: 0,
    reviewed: 0,
    rejected: 0,
    total: results.length,
  };
  for (const r of results) base[r.status] += 1;
  return base;
}

export function periodStartMs(preset: PeriodPreset): number | null {
  if (preset === "all") return null;
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

export function filterByPeriod(results: BidResult[], preset: PeriodPreset): BidResult[] {
  const start = periodStartMs(preset);
  if (start == null) return results;
  return results.filter((r) => new Date(r.pooledAt).getTime() >= start);
}

export function buildDateFolders(results: BidResult[]): DateFolder[] {
  const map = new Map<string, BidResult[]>();
  for (const r of results) {
    const list = map.get(r.dayKey) ?? [];
    list.push(r);
    map.set(r.dayKey, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, items]) => {
      const byStatus = Object.fromEntries(BID_STATUSES.map((s) => [s, 0])) as Record<
        BidResultStatus,
        number
      >;
      for (const item of items) byStatus[item.status] += 1;
      const d = new Date(`${dayKey}T12:00:00`);
      const label = Number.isNaN(d.getTime())
        ? dayKey
        : d.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
      return { dayKey, label, count: items.length, byStatus };
    });
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFolderShort(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
