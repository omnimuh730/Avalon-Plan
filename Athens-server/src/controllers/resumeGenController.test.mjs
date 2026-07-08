import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTokenMap, formatCompanyToken } from "./resumeGenController.js";

test("formatCompanyToken formats full career entry as natural sentence", () => {
  const result = formatCompanyToken({
    title: "Senior Software Engineer",
    company: "McGrow Hill",
    period: "2026.2 – Present",
    description: "E-learning platform",
  });
  assert.equal(result, "Senior Software Engineer at McGrow Hill (2026.2 – Present) — E-learning platform");
});

test("formatCompanyToken omits description when empty", () => {
  const result = formatCompanyToken({
    title: "Software Engineer",
    company: "WSECU",
    period: "2021.6 – 2022.1",
    description: "",
  });
  assert.equal(result, "Software Engineer at WSECU (2021.6 – 2022.1)");
});

test("formatCompanyToken omits period when empty", () => {
  const result = formatCompanyToken({
    title: "Engineer",
    company: "Acme",
    period: "",
    description: "Healthcare platform",
  });
  assert.equal(result, "Engineer at Acme — Healthcare platform");
});

test("formatCompanyToken uses title alone when company missing", () => {
  const result = formatCompanyToken({
    title: "Consultant",
    company: "",
    period: "2020 – 2021",
    description: "",
  });
  assert.equal(result, "Consultant (2020 – 2021)");
});

test("formatCompanyToken uses company alone when title missing", () => {
  const result = formatCompanyToken({
    title: "",
    company: "Robert Half",
    period: "2016.9 – 2021.5",
    description: "Recruiting & HR platform",
  });
  assert.equal(result, "Robert Half (2016.9 – 2021.5) — Recruiting & HR platform");
});

test("formatCompanyToken returns description alone when no title or company", () => {
  assert.equal(formatCompanyToken({ description: "Freelance projects" }), "Freelance projects");
});

test("buildTokenMap maps company1 and company2 from careers array", () => {
  const map = buildTokenMap(
    {
      careers: [
        {
          title: "Senior Software Engineer",
          company: "McGrow Hill",
          period: "2026.2 – Present",
          description: "E-learning platform",
        },
        {
          title: "Senior Software Engineer",
          company: "Accolade, Inc",
          period: "2022.1 – 2026.2",
          description: "Healthcare Platform",
        },
      ],
    },
    "Build scalable APIs",
    ["TypeScript", "React"],
  );

  assert.equal(
    map.company1,
    "Senior Software Engineer at McGrow Hill (2026.2 – Present) — E-learning platform",
  );
  assert.equal(
    map.company2,
    "Senior Software Engineer at Accolade, Inc (2022.1 – 2026.2) — Healthcare Platform",
  );
  assert.equal(map.job_description, "Build scalable APIs");
  assert.equal(map.job_skills, "TypeScript, React");
  assert.equal(
    map.career,
    "Senior Software Engineer | McGrow Hill | 2026.2 – Present — E-learning platform\nSenior Software Engineer | Accolade, Inc | 2022.1 – 2026.2 — Healthcare Platform",
  );
  assert.equal(map.company1_name, undefined);
  assert.equal(map.company1_title, undefined);
});
