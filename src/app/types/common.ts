export interface Msg {
  id: string;
  role: "user" | "ai";
  content: string;
  ts: string;
}

export interface MailThread {
  id: string;
  from: string;
  subj: string;
  prev: string;
  body: string;
  time: string;
  unread: boolean;
  tag: string;
  folder: "inbox" | "sent" | "drafts" | "trash" | "spam";
  labels: string[];
}

export interface MailLabel {
  id: string;
  name: string;
  color: BadgeVariant;
}

export interface Resume {
  id: string;
  name: string;
  version: string;
  updated: string;
  matchScore: number;
  skills: string[];
  isPrimary: boolean;
}

export type BadgeVariant =
  | "default"
  | "success"
  | "warn"
  | "err"
  | "violet"
  | "blue"
  | "subtle"
  | "amber"
  | "pink";
