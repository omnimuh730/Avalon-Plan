import { useCallback, useState } from "react";
import { MAIL_LABELS } from "../../../data/mail";
import type { BadgeVariant, MailLabel } from "../../../types";

const STORAGE_KEY = "athens-mail-labels";

const LABEL_COLORS: BadgeVariant[] = ["violet", "blue", "success", "amber", "pink", "subtle"];

function loadLabels(): MailLabel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MailLabel[];
  } catch {
    /* ignore */
  }
  return MAIL_LABELS.map((l) => ({ ...l }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function useMailLabels() {
  const [labels, setLabels] = useState<MailLabel[]>(loadLabels);

  const persist = useCallback((next: MailLabel[]) => {
    setLabels(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

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
      persist([...labels, label]);
      return label;
    },
    [labels, persist],
  );

  return { labels, createLabel };
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
