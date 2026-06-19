export const MAIL_THREADS = [
  { id: "t1", from: "Sarah Chen (Notion)", subj: "Re: Interview Confirmation — Tomorrow 2 PM", prev: "Sounds perfect! I've added the calendar invite. Looking forward to meeting you.", time: "10:24 AM", unread: true, tag: "Interview" },
  { id: "t2", from: "Meta Recruiting", subj: "Offer Letter — Engineering Lead", prev: "We're excited to extend an offer for the Engineering Lead position. Please find the details attached.", time: "9:15 AM", unread: true, tag: "Offer" },
  { id: "t3", from: "Stripe Careers", subj: "Application Update — Data Scientist", prev: "Thank you for your application. We'd like to move forward with a technical assessment.", time: "Yesterday", unread: false, tag: "Assessment" },
  { id: "t4", from: "LinkedIn Jobs", subj: "12 new jobs match your profile", prev: "Based on your preferences, here are new Senior Frontend roles you might like.", time: "Yesterday", unread: false, tag: "Recruiter" },
  { id: "t5", from: "GitHub Recruiting", subj: "Re: DevOps Engineer — Next Steps", prev: "Great news — the team would like to schedule a phone screen. Are you available next week?", time: "Mon", unread: false, tag: "Interview" },
];

export const MAIL_TAG_VARIANTS: Record<string, "violet" | "success" | "blue" | "subtle"> = {
  Interview: "violet",
  Offer: "success",
  Assessment: "blue",
  Recruiter: "subtle",
};
