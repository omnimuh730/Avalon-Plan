import { useCallback, useEffect, useState } from "react";
import { fetchMailLabels, createMailLabel } from "@/api/mail";
import type { BadgeVariant, MailLabel } from "../../../types";

const LABEL_COLORS: BadgeVariant[] = ["violet", "blue", "success", "amber", "pink", "subtle"];

function assignColors(labels: MailLabel[]): MailLabel[] {
  return labels.map((l, i) => ({
    ...l,
    color: l.color || LABEL_COLORS[i % LABEL_COLORS.length],
  }));
}

export function useMailLabels(applierName: string | undefined) {
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!applierName) return;
    setLoading(true);
    try {
      const serverLabels = await fetchMailLabels(applierName);
      setLabels(assignColors(serverLabels));
    } catch (e) {
      console.error("fetch mail labels failed", e);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [applierName]);

  useEffect(() => {
    if (!applierName) {
      setReady(true);
      return;
    }
    void reload();
  }, [applierName, reload]);

  const createLabel = useCallback(
    async (name: string, parentId?: string) => {
      if (!applierName) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      try {
        const label = await createMailLabel(applierName, trimmed, parentId);
        await reload();
        return label;
      } catch (e) {
        console.error("create mail label failed", e);
        return null;
      }
    },
    [applierName, reload],
  );

  return { labels, createLabel, ready, loading, reload };
}

/** Build a nested tree for sidebar rendering. */
export function buildLabelTree(labels: MailLabel[]): { label: MailLabel; depth: number }[] {
  const result: { label: MailLabel; depth: number }[] = [];

  function walk(parentId: string | undefined, depth: number) {
    const children = labels.filter((l) => l.parentId === parentId);
    for (const child of children) {
      result.push({ label: child, depth });
      walk(child.id, depth + 1);
    }
  }

  walk(undefined, 0);
  return result;
}
