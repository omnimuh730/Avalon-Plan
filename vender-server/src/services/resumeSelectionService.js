import fs from 'node:fs/promises';
import path from 'node:path';

function tokenize(text) {
  const raw = String(text || '').toLowerCase();
  const parts = raw.split(/[^a-z0-9+#]+/i).filter((part) => part.length >= 2);
  return new Set(parts);
}

function scoreFolder(folderName, jobTokens) {
  const folderTokens = tokenize(folderName.replace(/\+/g, ' '));
  let score = 0;
  for (const token of folderTokens) {
    if (jobTokens.has(token)) {
      score += 3;
    }
  }

  const compactJob = [...jobTokens].join(' ');
  const folder = folderName.toLowerCase();
  if (
    compactJob.includes(folder) ||
    folder.split(/\s*\+\s*/).some((chunk) => chunk.length > 3 && compactJob.includes(chunk.toLowerCase()))
  ) {
    score += 2;
  }

  return score;
}

async function listSubfolders(resumeFolderUrl) {
  const root = path.normalize(String(resumeFolderUrl || '').trim());
  if (!root) return [];

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function selectResumePdfPath(params) {
  const { resumeFolderUrl, fullName } = params;
  const jobBlob = [
    params.jobDescription || '',
    ...(Array.isArray(params.skills) ? params.skills : []).map(String),
  ].join(' ');
  const jobTokens = tokenize(jobBlob);

  const folders = await listSubfolders(resumeFolderUrl);
  if (folders.length === 0) {
    const root = path.normalize(String(resumeFolderUrl || '').trim());
    const direct = path.join(root, `${String(fullName || '').trim()}.pdf`);
    try {
      await fs.access(direct);
      return {
        subfolder: '',
        resumePdfPath: direct,
        score: 0,
        candidates: [],
      };
    } catch {
      return { subfolder: '', resumePdfPath: '', score: 0, candidates: [] };
    }
  }

  let best = folders[0];
  let bestScore = scoreFolder(best, jobTokens);
  for (const folder of folders.slice(1)) {
    const score = scoreFolder(folder, jobTokens);
    if (score > bestScore) {
      bestScore = score;
      best = folder;
    }
  }

  const root = path.normalize(String(resumeFolderUrl || '').trim());
  const resumePdfPath = path.join(root, best, `${String(fullName || '').trim()}.pdf`);
  try {
    await fs.access(resumePdfPath);
  } catch {
    return {
      subfolder: best,
      resumePdfPath: '',
      score: bestScore,
      candidates: folders,
      error: `PDF not found at ${resumePdfPath}`,
    };
  }

  return {
    subfolder: best,
    resumePdfPath,
    score: bestScore,
    candidates: folders,
  };
}

export function profileResumeMatch(pick) {
  if (!pick?.resumePdfPath) return null;

  const label = pick.subfolder || path.basename(pick.resumePdfPath, '.pdf');
  const normalizedScore = Math.max(0, Math.min(1, pick.score / 12));
  return {
    name: label,
    score: normalizedScore,
    scorePercent: Math.round(normalizedScore * 100),
    resumePdfPath: pick.resumePdfPath,
    subfolder: pick.subfolder,
  };
}
