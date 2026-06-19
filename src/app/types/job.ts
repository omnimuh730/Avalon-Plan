export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  status: "saved" | "applied" | "closed";
  matchScore: number;
  posted: string;
  salary: string;
  source: string;
}
