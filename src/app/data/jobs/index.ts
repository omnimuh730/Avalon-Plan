import type { Job } from "../../types";

const COMPANIES = [
  "Vercel", "Linear", "Figma", "OpenAI", "GitHub", "Stripe", "Notion", "Anthropic",
  "Meta", "Google", "Apple", "Netflix", "Airbnb", "Databricks", "Snowflake",
  "Coinbase", "Robinhood", "Plaid", "Ramp", "Brex", "Scale AI", "Hugging Face",
  "Replicate", "Supabase", "PlanetScale", "Cloudflare", "Datadog", "MongoDB", "Elastic", "HashiCorp",
];

const TITLES = [
  "Senior Frontend Engineer", "Staff Engineer", "Engineering Lead", "ML Engineer",
  "DevOps Engineer", "Product Designer", "Backend Engineer", "Full Stack Engineer",
  "Platform Engineer", "Data Engineer", "Security Engineer", "Mobile Engineer",
];

const LOCATIONS = ["Remote", "San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Boston, MA"];
const SOURCES = ["LinkedIn", "Indeed", "Referral", "Direct", "Glassdoor", "Company Site"];
const STATUSES: Job["status"][] = ["saved", "applied", "closed"];

function seeded(i: number, max: number) {
  return ((i * 17 + 7) % max);
}

export const JOBS: Job[] = Array.from({ length: 30 }, (_, i) => {
  const status = STATUSES[seeded(i, 3)];
  const matchScore = 72 + seeded(i, 27);
  const daysAgo = 1 + seeded(i, 14);
  const salaryBase = 120 + seeded(i, 8) * 10;
  return {
    id: `j${i + 1}`,
    title: TITLES[seeded(i, TITLES.length)],
    company: COMPANIES[i],
    location: LOCATIONS[seeded(i, LOCATIONS.length)],
    type: seeded(i, 5) === 0 ? "Contract" : "Full-time",
    status,
    matchScore,
    posted: daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`,
    salary: `$${salaryBase}k–$${salaryBase + 40}k`,
    source: SOURCES[seeded(i, SOURCES.length)],
  };
});
