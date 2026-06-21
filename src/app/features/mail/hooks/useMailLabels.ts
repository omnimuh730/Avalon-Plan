import { useCallback, useEffect, useState } from "react";
import { fetchMailLabels, saveMailLabels } from "@/api/mail";
import { MAIL_LABELS } from "../../../data/mail";
import type { BadgeVariant, MailLabel } from "../../../types";

const LABEL_COLORS: BadgeVariant[] = ["violet", "blue", "success", "amber", "pink", "subtle"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function useMailLabels(applierName: string | undefined) {
  const [labels, setLabels] = useState<MailLabel[]>(MAIL_LABELS.map((l) => ({ ...l })));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!applierName) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const serverLabels = await fetchMailLabels(applierName);
        if (!cancelled && serverLabels.length > 0) {
          setLabels(serverLabels);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applierName]);

  const persist = useCallback(
    async (next: MailLabel[]) => {
      setLabels(next);
      if (applierName) {
        try {
          await saveMailLabels(applierName, next);
        } catch (e) {
          console.error("save mail labels failed", e);
        }
      }
    },
    [applierName],
  );

  const createLabel = useCallback(
    (name: string, parentId?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      if (labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return null;

      let id = slugify(trimmed);
      if (labels.some((l) => l.id === id)) id = `${id}-${Date.now()}`;

      const label: MailLabel = {
        id,
        name: trimmed,
        color: LABEL_COLORS[labels.length % LABEL_COLORS.length],
        ...(parentId ? { parentId } : {}),
      };
      void persist([...labels, label]);
      return label;
    },
    [labels, persist],
  );

  return { labels, createLabel, ready };
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
