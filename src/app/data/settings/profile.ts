export type CareerEntry = {
  id: string;
  type: "role" | "education";
  title: string;
  org: string;
  start: string;
  end: string;
  current?: boolean;
};

export type UserProfile = {
  firstName: string;
  lastName: string;
  age: string;
  gender: string;
  pronouns: string;
  orientation: string;
  email: string;
  phone: string;
  gmailAppPassword: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  citizenship: string;
  hispanic: string;
  race: string;
  visa: string;
  disability: string;
  veteran: string;
  targetRole: string;
  desiredSalary: string;
  workAuth: string;
  remotePreference: string;
  openaiKey: string;
  openaiModel: string;
  deepseekKey: string;
  resumeFolder: string;
  linkedin: string;
  github: string;
  portfolio: string;
  vendorAccess: boolean;
  timeline: CareerEntry[];
};

export const DEFAULT_PROFILE: UserProfile = {
  firstName: "Jordan",
  lastName: "Doe",
  age: "32",
  gender: "Non-binary",
  pronouns: "they/them",
  orientation: "Prefer not to say",
  email: "jordan.doe@email.com",
  phone: "+1 (555) 123-4567",
  gmailAppPassword: "••••••••••••",
  street: "123 Market Street",
  city: "San Francisco",
  state: "California",
  zip: "94105",
  country: "United States",
  citizenship: "US Citizen",
  hispanic: "No",
  race: "Asian",
  visa: "No sponsorship needed",
  disability: "No",
  veteran: "No",
  targetRole: "Senior Frontend Engineer",
  desiredSalary: "180000",
  workAuth: "Authorized to work in US",
  remotePreference: "Remote preferred",
  openaiKey: "sk-••••••••••••",
  openaiModel: "gpt-5-nano",
  deepseekKey: "••••••••••••",
  resumeFolder: "/Users/jordan/resumes",
  linkedin: "https://linkedin.com/in/jordandoe",
  github: "https://github.com/jordandoe",
  portfolio: "https://jordandoe.dev",
  vendorAccess: false,
  timeline: [
    { id: "e1", type: "role", title: "Senior Software Engineer", org: "Acme Corp", start: "2022-02", end: "", current: true },
    { id: "e2", type: "role", title: "Software Engineer", org: "StartupXYZ", start: "2019-06", end: "2022-01" },
    { id: "e3", type: "education", title: "B.S. Computer Science", org: "State University", start: "2015-09", end: "2019-05" },
  ],
};

export function profileCompletion(p: UserProfile): number {
  const fields = [
    p.firstName, p.lastName, p.email, p.phone, p.city, p.targetRole,
    p.desiredSalary, p.linkedin, p.github, p.timeline.length > 0 ? "x" : "",
  ];
  const filled = fields.filter((f) => f && f.trim()).length;
  return Math.round((filled / fields.length) * 100);
}
