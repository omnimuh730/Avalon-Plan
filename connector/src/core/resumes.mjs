import { ObjectId } from "mongodb";
import { getDb, accountCollection } from "./db.mjs";
import {
  listResumeStacks,
  profileSummary,
  transformAutoBidProfile,
} from "./profiles.mjs";
import { attachResumeFromLibrary, listUserResumesWithContent } from "./user-resumes.mjs";
import { listProfilesFromAthens, getProfileFromAthens } from "../athens-client.mjs";
import { CONFIG } from "../engines/config.mjs";

const USE_ATHENS_REST = (process.env.ATHENS_USE_REST || "true") !== "false";

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function listProfiles() {
  if (USE_ATHENS_REST && CONFIG.athensServerUrl) {
    try {
      const profiles = await listProfilesFromAthens();
      return profiles.map((p) => profileSummary({ _id: p.id, name: p.name, autoBidProfile: p.autoBidProfile }));
    } catch (err) {
      console.warn("[connector] Athens REST listProfiles failed, falling back to Mongo:", err.message);
    }
  }
  const db = await getDb();
  const docs = await accountCollection(db).find({}, { projection: { password: 0 } }).sort({ name: 1 }).toArray();
  return docs.map(profileSummary);
}

export async function getProfileById(id, { stackName, jobContext } = {}) {
  if (USE_ATHENS_REST && CONFIG.athensServerUrl) {
    try {
      const doc = await getProfileFromAthens(id);
      if (!doc) return null;
      const profile = transformAutoBidProfile(doc);
      return await attachResumeFromLibrary(profile, { stackName });
    } catch (err) {
      console.warn("[connector] Athens REST getProfileById failed, falling back to Mongo:", err.message);
    }
  }
  const oid = parseId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await accountCollection(db).findOne({ _id: oid }, { projection: { password: 0 } });
  if (!doc) return null;
  const profile = transformAutoBidProfile(doc);
  return await attachResumeFromLibrary(profile, { stackName });
}

export async function getProfileResumes(id) {
  const oid = parseId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await accountCollection(db).findOne({ _id: oid }, { projection: { autoBidProfile: 1, resumeCatalog: 1, name: 1 } });
  if (!doc) return null;
  const folder = doc.autoBidProfile?.resumeFolderUrl || "";
  const ownerId = String(doc._id);
  const uploaded = await listUserResumesWithContent(ownerId, { ownerName: doc.name });
  const mongoStacks = [...new Set(uploaded.map((r) => r.techStack).filter(Boolean))];
  return {
    id: ownerId,
    name: doc.name,
    resumeFolderUrl: folder,
    resumeDir: folder,
    stacks: mongoStacks.length ? mongoStacks : listResumeStacks(folder),
    catalog: Object.keys(doc.resumeCatalog || {}),
    resumes: uploaded.map((r) => ({
      id: String(r._id),
      techStack: r.techStack,
      fileName: r.fileName,
      mimeType: r.mimeType,
      isPrimary: Boolean(r.isPrimary),
      analyzed: Boolean(r.analyzed),
    })),
  };
}
