import {
  CheckCircle,
  Bot,
  Video,
  Sparkles,
  Mail,
  Briefcase,
} from "lucide-react";

export const AREA_DATA = [
  { m: "Jan", apps: 8, responses: 2, interviews: 1, offers: 0 },
  { m: "Feb", apps: 12, responses: 4, interviews: 2, offers: 0 },
  { m: "Mar", apps: 10, responses: 3, interviews: 2, offers: 1 },
  { m: "Apr", apps: 15, responses: 6, interviews: 3, offers: 1 },
  { m: "May", apps: 18, responses: 7, interviews: 4, offers: 1 },
  { m: "Jun", apps: 22, responses: 9, interviews: 5, offers: 2 },
];

export const SRC_DATA = [
  { src: "LinkedIn", apps: 18, responses: 6, rate: 33.3 },
  { src: "Referral", apps: 8, responses: 5, rate: 62.5 },
  { src: "Direct", apps: 6, responses: 3, rate: 50.0 },
  { src: "Indeed", apps: 10, responses: 2, rate: 20.0 },
  { src: "AngelList", apps: 5, responses: 1, rate: 20.0 },
];

export const ACTIVITIES = [
  {
    icon: CheckCircle,
    c: "text-emerald-600",
    t: "Offer received from Meta for Engineering Lead role",
    ts: "2h ago",
  },
  {
    icon: Briefcase,
    c: "text-violet-600",
    t: "Job Scout found 12 new matches on LinkedIn",
    ts: "3h ago",
  },
  {
    icon: Video,
    c: "text-blue-600",
    t: "Notion interview scheduled for tomorrow 2 PM",
    ts: "4h ago",
  },
  {
    icon: Bot,
    c: "text-amber-600",
    t: "Follow-up Agent sent 3 follow-up emails",
    ts: "5h ago",
  },
  {
    icon: Mail,
    c: "text-pink-600",
    t: "Recruiter replied to your Stripe application",
    ts: "1d ago",
  },
  {
    icon: Sparkles,
    c: "text-violet-600",
    t: "Resume Optimizer improved match score +12% for OpenAI",
    ts: "1d ago",
  },
];

export const AI_RECS = [
  {
    t: "Vercel role is a 94% match. Tailor your resume to highlight design system experience.",
    a: "Tailor resume →",
    c: "text-violet-600",
  },
  {
    t: "No response from Stripe in 12 days. Follow-up Agent can draft a polite nudge.",
    a: "Draft follow-up →",
    c: "text-amber-600",
  },
  {
    t: "Notion interview tomorrow. Interview Prep Agent has a custom plan ready.",
    a: "Start prep →",
    c: "text-blue-600",
  },
];

export const MAIL_THREADS = [
  {
    id: "t1",
    from: "Sarah Chen (Notion)",
    subj: "Re: Interview Confirmation — Tomorrow 2 PM",
    prev: "Sounds perfect! I've added the calendar invite. Looking forward to meeting you.",
    time: "10:24 AM",
    unread: true,
    tag: "Interview",
  },
  {
    id: "t2",
    from: "Meta Recruiting",
    subj: "Offer Letter — Engineering Lead",
    prev: "We're excited to extend an offer for the Engineering Lead position. Please find the details attached.",
    time: "9:15 AM",
    unread: true,
    tag: "Offer",
  },
  {
    id: "t3",
    from: "Stripe Careers",
    subj: "Application Update — Data Scientist",
    prev: "Thank you for your application. We'd like to move forward with a technical assessment.",
    time: "Yesterday",
    unread: false,
    tag: "Assessment",
  },
  {
    id: "t4",
    from: "LinkedIn Jobs",
    subj: "12 new jobs match your profile",
    prev: "Based on your preferences, here are new Senior Frontend roles you might like.",
    time: "Yesterday",
    unread: false,
    tag: "Recruiter",
  },
  {
    id: "t5",
    from: "GitHub Recruiting",
    subj: "Re: DevOps Engineer — Next Steps",
    prev: "Great news — the team would like to schedule a phone screen. Are you available next week?",
    time: "Mon",
    unread: false,
    tag: "Interview",
  },
];

export const RESUMES = [
  {
    id: "r1",
    name: "Software Engineer — General",
    version: "v3.2",
    updated: "2 days ago",
    matchScore: 88,
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
    isPrimary: true,
  },
  {
    id: "r2",
    name: "Frontend Specialist",
    version: "v2.1",
    updated: "1 week ago",
    matchScore: 94,
    skills: ["React", "TypeScript", "Performance", "Design Systems"],
    isPrimary: false,
  },
  {
    id: "r3",
    name: "Full Stack — Startup",
    version: "v1.4",
    updated: "2 weeks ago",
    matchScore: 82,
    skills: ["React", "Go", "AWS", "Docker"],
    isPrimary: false,
  },
];

export const QUESTIONS = [
  {
    cat: "System Design",
    diff: "Hard",
    q: "Design a rate limiter for a distributed API gateway handling 10M req/s. Walk through your approach, trade-offs, and failure modes.",
  },
  {
    cat: "Technical",
    diff: "Medium",
    q: "How would you optimize a React app rendering 10,000+ list items? Describe your profiling strategy and the solutions you'd apply.",
  },
  {
    cat: "Behavioral",
    diff: "Medium",
    q: "Tell me about a time you drove a significant technical decision without direct authority. What was the outcome?",
  },
  {
    cat: "System Design",
    diff: "Hard",
    q: "Design a real-time collaborative editing system. Focus on conflict resolution, consistency guarantees, and latency.",
  },
  {
    cat: "Culture",
    diff: "Easy",
    q: "Describe your ideal engineering culture. How do you actively contribute to building it?",
  },
  {
    cat: "Technical",
    diff: "Hard",
    q: "Walk me through how browsers render a webpage from network request to painted pixels. Where would you look for performance bottlenecks?",
  },
];

export const CAL_EVENTS: Record<number, { title: string; c: string }[]> = {
  19: [
    {
      title: "Notion PM Interview",
      c: "bg-violet-100 text-violet-700 border-l-2 border-violet-500",
    },
  ],
  20: [
    {
      title: "Stripe Assessment Due",
      c: "bg-blue-100 text-blue-700 border-l-2 border-blue-500",
    },
  ],
  22: [
    {
      title: "Meta Offer Call",
      c: "bg-pink-100 text-pink-700 border-l-2 border-pink-500",
    },
    {
      title: "Follow-up: Linear",
      c: "bg-amber-100 text-amber-700 border-l-2 border-amber-500",
    },
  ],
  25: [
    {
      title: "Anthropic Tech Interview",
      c: "bg-violet-100 text-violet-700 border-l-2 border-violet-500",
    },
  ],
  26: [
    {
      title: "Job Scout Weekly Review",
      c: "bg-emerald-100 text-emerald-700 border-l-2 border-emerald-500",
    },
  ],
  30: [
    {
      title: "GitHub Phone Screen",
      c: "bg-violet-100 text-violet-700 border-l-2 border-violet-500",
    },
  ],
};

export const ROLE_PIE = [
  { name: "Frontend", v: 42, c: "#6c5ce7" },
  { name: "Full Stack", v: 28, c: "#2dd4bf" },
  { name: "ML/AI", v: 18, c: "#f59e0b" },
  { name: "DevOps", v: 8, c: "#f472b6" },
  { name: "Other", v: 4, c: "#60a5fa" },
];
