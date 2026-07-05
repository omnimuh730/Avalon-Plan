import { Badge } from "@/app/components/ui";
import { detectJobSource, jobSourceBadgeVariant, type JobSource } from "@/lib/job-source";

export function JobSourceChip({ source }: { source: JobSource | null | undefined }) {
  if (!source) return null;
  return (
    <Badge v={jobSourceBadgeVariant(source.color)}>
      <span className="text-[10px] normal-case">{source.label}</span>
    </Badge>
  );
}

export function JobSourceFromUrl({ url }: { url: string | null | undefined }) {
  const source = detectJobSource(url);
  return <JobSourceChip source={source} />;
}
