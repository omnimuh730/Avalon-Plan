import { costFromUsage } from '@nextoffer/shared/pricing';
import { getUsageCollection } from './db.js';

export type UsageRecord = {
  feature?: string;
  runId?: string;
  profileId?: string;
  model: string;
  provider: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  priced: boolean;
  createdAt: Date;
};

const runTokenTotals = new Map<string, number>();

export async function recordUsage(row: Omit<UsageRecord, 'createdAt'>) {
  const doc: UsageRecord = { ...row, createdAt: new Date() };
  await getUsageCollection().insertOne(doc);
  if (row.runId) {
    const prev = runTokenTotals.get(row.runId) ?? 0;
    runTokenTotals.set(row.runId, prev + row.totalTokens);
  }
  return doc;
}

export function getRunTokenTotal(runId: string) {
  return runTokenTotals.get(runId) ?? 0;
}

export function addRunTokenTotal(runId: string, tokens: number) {
  if (!runId || tokens <= 0) return;
  const prev = runTokenTotals.get(runId) ?? 0;
  runTokenTotals.set(runId, prev + tokens);
}

export function normalizeUsage(model: string, usage: Record<string, unknown>) {
  return costFromUsage(model, usage);
}

export async function aggregateUsage({ feature, runId, since }: {
  feature?: string;
  runId?: string;
  since?: Date;
}) {
  const match: Record<string, unknown> = {};
  if (feature) match.feature = feature;
  if (runId) match.runId = runId;
  if (since) match.createdAt = { $gte: since };

  const rows = await getUsageCollection().aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        inputTokens: { $sum: '$inputTokens' },
        cachedTokens: { $sum: '$cachedTokens' },
        outputTokens: { $sum: '$outputTokens' },
        totalTokens: { $sum: '$totalTokens' },
        costUsd: { $sum: '$costUsd' },
        calls: { $sum: 1 },
      },
    },
  ]).toArray();

  return rows[0] ?? {
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    calls: 0,
  };
}
