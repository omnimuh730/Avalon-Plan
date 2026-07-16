/**
 * Bid-ready queue helpers for the bid-assistant bridge (AthensDB.job_market).
 */

function normalizeApplyUrlKey(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

async function resolveApplierId(accountInfoCollection, applierName) {
  if (!accountInfoCollection || !applierName) return null;
  const doc = await accountInfoCollection.findOne(
    { name: String(applierName).trim() },
    { projection: { _id: 1 } },
  );
  return doc?._id ?? null;
}

function findStatusEntry(job, applierId) {
  if (!job || !Array.isArray(job.status)) return null;
  return job.status.find((s) => s && String(s.applier) === String(applierId)) ?? null;
}

export async function listBidReadyQueue(
  jobsCollection,
  accountInfoCollection,
  applierName,
  { limit = 5, preview = 3 } = {},
) {
  if (!jobsCollection) return { total: 0, preview: [], jobs: [] };
  const applierId = await resolveApplierId(accountInfoCollection, applierName);
  if (!applierId) return { total: 0, preview: [], jobs: [] };

  const filter = {
    status: {
      $elemMatch: {
        applier: applierId,
        bidReadyDate: { $exists: true },
        bidCompletedDate: { $exists: false },
        appliedDate: { $exists: false },
        scheduledDate: { $exists: false },
        declinedDate: { $exists: false },
      },
    },
  };

  const total = await jobsCollection.countDocuments(filter);
  const take = Math.max(1, Math.min(50, Number(limit) || 5));
  const docs = await jobsCollection.find(filter).sort({ _id: -1 }).limit(take).toArray();

  const jobs = docs.map((job) => {
    const entry = findStatusEntry(job, applierId);
    const company =
      job.company && typeof job.company === 'object'
        ? String(job.company.name || '')
        : String(job.companyName || '');
    return {
      jobId: String(job._id),
      title: String(job.title || 'Untitled role'),
      company,
      applyUrl: String(job.applyLink || job.jobLink || ''),
      source: String(job.source || ''),
      bidReadyDate: entry?.bidReadyDate ?? null,
    };
  });

  const previewCount = Math.max(0, Math.min(Number(preview) || 3, jobs.length));
  return {
    total,
    preview: jobs.slice(0, previewCount),
    jobs,
  };
}

export async function markBidCompletedByUrl(
  jobsCollection,
  accountInfoCollection,
  applierName,
  url,
) {
  if (!jobsCollection || !applierName || !url) {
    return { updated: false, jobId: null };
  }
  const applierId = await resolveApplierId(accountInfoCollection, applierName);
  if (!applierId) return { updated: false, jobId: null };

  const raw = String(url).trim();
  let job = await jobsCollection.findOne({
    $or: [{ applyLink: raw }, { jobLink: raw }],
  });

  if (!job) {
    const key = normalizeApplyUrlKey(raw);
    if (key) {
      const candidates = await jobsCollection
        .find(
          {
            $or: [
              { applyLink: { $type: 'string', $ne: '' } },
              { jobLink: { $type: 'string', $ne: '' } },
            ],
          },
          { projection: { applyLink: 1, jobLink: 1, status: 1 } },
        )
        .limit(5000)
        .toArray();
      for (const candidate of candidates) {
        const a = normalizeApplyUrlKey(candidate.applyLink);
        const b = normalizeApplyUrlKey(candidate.jobLink);
        if (a && (a === key || a.includes(key) || key.includes(a))) {
          job = candidate;
          break;
        }
        if (b && (b === key || b.includes(key) || key.includes(b))) {
          job = candidate;
          break;
        }
      }
    }
  }

  if (!job?._id) return { updated: false, jobId: null };

  const now = new Date().toISOString();
  const existing = findStatusEntry(job, applierId);
  if (!existing) {
    await jobsCollection.updateOne(
      { _id: job._id },
      {
        $push: {
          status: {
            applier: applierId,
            bidReadyDate: now,
            bidCompletedDate: now,
          },
        },
      },
    );
  } else {
    const $set = { 'status.$[elem].bidCompletedDate': now };
    if (!existing.bidReadyDate) $set['status.$[elem].bidReadyDate'] = now;
    await jobsCollection.updateOne(
      { _id: job._id },
      { $set },
      { arrayFilters: [{ 'elem.applier': applierId }] },
    );
  }

  return { updated: true, jobId: String(job._id) };
}
