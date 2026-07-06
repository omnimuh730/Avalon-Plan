import { buildVerificationChecks } from './profileVerifyService.js';

const GENDER_LABELS = {
  prefer_not_say: 'Prefer not to say',
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  other: 'Other',
};

const PRONOUN_LABELS = {
  prefer_not_say: 'Prefer not to say',
  'she/her': 'she/her',
  'he/him': 'he/him',
  'they/them': 'they/them',
  'she/they': 'she/they',
  'he/they': 'he/they',
  'xe/xem': 'xe/xem',
  'ze/hir': 'ze/hir',
  other: 'Other',
};

const SEXUAL_ORIENTATION_LABELS = {
  prefer_not_say: 'Prefer not to say',
  heterosexual: 'Heterosexual',
  gay: 'Gay',
  lesbian: 'Lesbian',
  bisexual: 'Bisexual',
  pansexual: 'Pansexual',
  asexual: 'Asexual',
  other: 'Other',
};

const YES_NO_LABELS = {
  prefer_not_say: 'Prefer not to say',
  yes: 'Yes',
  no: 'No',
};

const RACE_LABELS = {
  prefer_not_say: 'Prefer not to say',
  american_indian_alaska_native: 'American Indian or Alaska Native',
  asian: 'Asian',
  black: 'Black or African American',
  native_hawaiian: 'Native Hawaiian or Other Pacific Islander',
  white: 'White',
  two_or_more: 'Two or more races',
  other: 'Other',
};

const VETERAN_LABELS = {
  prefer_not_say: 'Prefer not to say',
  protected: 'Protected veteran',
  not_protected: 'Not a protected veteran',
};

const IMMIGRATION_LABELS = {
  prefer_not_say: 'Prefer not to say',
  us_citizen: 'U.S. citizen',
  permanent_resident: 'Permanent resident',
  work_visa: 'Work visa holder',
  requires_sponsorship: 'Requires sponsorship',
};

function defaultEducationEntry() {
  return { school: '', diploma: '', startMonth: '', startYear: '', endMonth: '', endYear: '' };
}

function defaultCareerEntry() {
  return { company: '', title: '', startMonth: '', startYear: '', endMonth: '', endYear: '', endPresent: false };
}

function formatMonthYear(month, year, present = false) {
  if (present) {
    const start = month && year ? `${year}.${month}` : year || '';
    return start ? `${start} - present` : 'present';
  }
  if (month && year) return `${year}.${month}`;
  return year || '';
}

function formatEducation(entries) {
  return entries
    .filter((entry) => entry.school || entry.diploma)
    .map((entry) => {
      const range = [formatMonthYear(entry.startMonth, entry.startYear), formatMonthYear(entry.endMonth, entry.endYear)]
        .filter(Boolean)
        .join(' - ');
      return [entry.diploma, entry.school, range].filter(Boolean).join(' · ');
    });
}

function formatCareers(entries) {
  return entries
    .filter((entry) => entry.company || entry.title)
    .map((entry) => {
      const range = formatMonthYear(
        entry.startMonth,
        entry.startYear,
        entry.endPresent,
      );
      const end = entry.endPresent
        ? range
        : [range, formatMonthYear(entry.endMonth, entry.endYear)].filter(Boolean).join(' - ');
      return [entry.title, entry.company, end].filter(Boolean).join(' · ');
    });
}

function label(map, value) {
  const key = String(value ?? '').trim();
  if (!key) return '';
  return map[key] ?? key;
}

/** Public profile shape — never includes gmailAppPassword. */
export function buildPublicProfile(raw = {}) {
  const educationRaw = Array.isArray(raw.education) ? raw.education : [];
  const careersRaw = Array.isArray(raw.careers) ? raw.careers : [];
  const education = educationRaw.length ? educationRaw : [defaultEducationEntry()];
  const careers = careersRaw.length ? careersRaw : [defaultCareerEntry()];

  return {
    fullName: raw.fullName || '',
    firstName: raw.firstName || '',
    lastName: raw.lastName || '',
    age: raw.age != null ? String(raw.age) : '',
    address: raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    country: raw.country || '',
    zipCode: raw.zipCode || '',
    desiredSalary: raw.desiredSalary || '',
    gender: raw.gender || '',
    pronouns: raw.pronouns || '',
    sexualOrientation: raw.sexualOrientation || '',
    email: raw.email || '',
    phone: raw.phone || '',
    linkedin: raw.linkedin || '',
    github: raw.github || '',
    portfolioUrl: raw.portfolioUrl || '',
    education,
    careers,
    companyCareer: raw.companyCareer || '',
    prefSponsorship: !!raw.prefSponsorship,
    prefVeteranFriendly: !!raw.prefVeteranFriendly,
    prefDisabilityFriendly: !!raw.prefDisabilityFriendly,
    demographicHispanic: raw.demographicHispanic || '',
    demographicRaceEthnicity: raw.demographicRaceEthnicity || '',
    demographicDisability: raw.demographicDisability || '',
    demographicMilitaryStatus: raw.demographicMilitaryStatus || '',
    sponsorship: raw.sponsorship || '',
    immigrationStatus: raw.immigrationStatus || '',
    resumeFolderUrl: raw.resumeFolderUrl || '',
    updatedAt: raw.updatedAt || null,
  };
}

/** Human-readable block for LLM prompts. */
export function formatProfileForAnalysis(profile, skills = []) {
  const lines = [
    'Applicant profile (use these exact values for form answers when a field matches):',
    profile.fullName ? `Full name: ${profile.fullName}` : null,
    profile.firstName ? `First name: ${profile.firstName}` : null,
    profile.lastName ? `Last name: ${profile.lastName}` : null,
    profile.age ? `Age: ${profile.age}` : null,
    profile.email ? `Email: ${profile.email}` : null,
    profile.phone ? `Phone: ${profile.phone}` : null,
    profile.address ? `Street address: ${profile.address}` : null,
    profile.city ? `City: ${profile.city}` : null,
    profile.state ? `State/Province: ${profile.state}` : null,
    profile.country ? `Country: ${profile.country}` : null,
    profile.zipCode ? `ZIP/Postal code: ${profile.zipCode}` : null,
    profile.desiredSalary ? `Desired salary: ${profile.desiredSalary}` : null,
    profile.linkedin ? `LinkedIn: ${profile.linkedin}` : null,
    profile.github ? `GitHub: ${profile.github}` : null,
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : null,
    profile.gender ? `Gender: ${label(GENDER_LABELS, profile.gender)}` : null,
    profile.pronouns ? `Pronouns: ${label(PRONOUN_LABELS, profile.pronouns)}` : null,
    profile.sexualOrientation
      ? `Sexual orientation: ${label(SEXUAL_ORIENTATION_LABELS, profile.sexualOrientation)}`
      : null,
    profile.demographicHispanic
      ? `Hispanic or Latino: ${label(YES_NO_LABELS, profile.demographicHispanic)}`
      : null,
    profile.demographicRaceEthnicity
      ? `Race/Ethnicity: ${label(RACE_LABELS, profile.demographicRaceEthnicity)}`
      : null,
    profile.demographicDisability
      ? `Disability status: ${label(YES_NO_LABELS, profile.demographicDisability)}`
      : null,
    profile.demographicMilitaryStatus
      ? `Veteran status: ${label(VETERAN_LABELS, profile.demographicMilitaryStatus)}`
      : null,
    profile.sponsorship ? `Requires sponsorship: ${label(YES_NO_LABELS, profile.sponsorship)}` : null,
    profile.immigrationStatus
      ? `Work authorization: ${label(IMMIGRATION_LABELS, profile.immigrationStatus)}`
      : null,
  ].filter(Boolean);

  const educationLines = formatEducation(profile.education);
  if (educationLines.length) {
    lines.push('Education:');
    for (const entry of educationLines) {
      lines.push(`- ${entry}`);
    }
  }

  const careerLines = formatCareers(profile.careers);
  if (careerLines.length) {
    lines.push('Work history:');
    for (const entry of careerLines) {
      lines.push(`- ${entry}`);
    }
  }

  if (skills.length) {
    lines.push(`Skills on profile: ${skills.join(', ')}`);
  }

  if (profile.resumeFolderUrl) {
    lines.push(`Resume folder: ${profile.resumeFolderUrl}`);
  }

  return lines.join('\n');
}

export function resolveApplierName(requestApplierName) {
  const fromRequest = String(requestApplierName ?? '').trim();
  if (fromRequest) return fromRequest;
  return String(process.env.APPLIER_NAME ?? '').trim();
}

async function findAccountByApplierName(accountInfoCollection, nameRaw) {
  const trimmed = String(nameRaw ?? '').trim();
  if (!trimmed || !accountInfoCollection) return null;

  let acc = await accountInfoCollection.findOne(
    { name: trimmed },
    { projection: { name: 1, autoBidProfile: 1, resumeCatalog: 1, vendorAllowed: 1 } },
  );
  if (acc) return acc;

  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  acc = await accountInfoCollection.findOne(
    { name: { $regex: new RegExp(`^${esc}$`, 'i') } },
    { projection: { name: 1, autoBidProfile: 1, resumeCatalog: 1, vendorAllowed: 1 } },
  );
  return acc || null;
}

export async function loadSkills(personalInfoCollection) {
  if (!personalInfoCollection) return [];
  const docs = await personalInfoCollection.find({}, { projection: { name: 1 } }).toArray();
  return docs.map((doc) => String(doc.name ?? '').trim()).filter(Boolean);
}

export async function loadProfileBundle(accountInfoCollection, personalInfoCollection, applierName) {
  const resolvedName = resolveApplierName(applierName);
  if (!resolvedName) {
    throw new Error('applierName is required. Set APPLIER_NAME in .env or pass applierName in the request.');
  }

  const account = await findAccountByApplierName(accountInfoCollection, resolvedName);
  if (!account) {
    throw new Error(`No account named "${resolvedName}". Add it in lancer-frontend Applier accounts first.`);
  }
  if (!account.vendorAllowed) {
    throw new Error(
      `Vendor access is not enabled for "${account.name}". Enable "Allow vendor access" in lancer Profile settings.`,
    );
  }

  const rawProfile = account.autoBidProfile || {};
  const profile = buildPublicProfile(rawProfile);
  const skills = await loadSkills(personalInfoCollection);
  const resumeCatalog =
    account.resumeCatalog && typeof account.resumeCatalog === 'object' && !Array.isArray(account.resumeCatalog)
      ? account.resumeCatalog
      : {};

  return {
    profileId: account._id ? String(account._id) : null,
    applierName: account.name,
    profile,
    skills,
    resumeCatalog,
    imapCredentials: {
      email: String(rawProfile.email ?? '').trim(),
      password: String(rawProfile.gmailAppPassword ?? '').replace(/\s/g, ''),
    },
    openAi: {
      apiKey: String(rawProfile.openaiApiKey ?? '').trim(),
      model: String(rawProfile.openaiModel ?? '').trim() || 'gpt-5-nano',
    },
  };
}

export async function listApplierNames(accountInfoCollection) {
  if (!accountInfoCollection) return [];
  const docs = await accountInfoCollection
    .find({ vendorAllowed: true }, { projection: { name: 1 } })
    .toArray();
  return docs.map((doc) => String(doc.name ?? '').trim()).filter(Boolean);
}

export async function verifyApplierProfile(
  accountInfoCollection,
  personalInfoCollection,
  verifyImap,
  applierNameRaw,
) {
  const applierName = String(applierNameRaw ?? '').trim();
  if (!applierName) {
    throw new Error('applierName is required.');
  }

  const account = await findAccountByApplierName(accountInfoCollection, applierName);
  if (!account) {
    return {
      ready: false,
      applierName,
      accountExists: false,
      checks: {
        profile: {
          ok: false,
          message: `No account named "${applierName}". Add it in lancer-frontend first.`,
          missing: ['account'],
        },
        resume: { ok: false, message: 'Account not found.', stackCount: 0 },
        openai: { ok: false, message: 'Account not found.', model: null },
        gmail: { ok: false, message: 'Account not found.', email: null, tested: false },
        vendorAccess: { ok: false, message: 'Account not found.' },
      },
    };
  }

  const rawProfile = account.autoBidProfile || {};
  const profile = buildPublicProfile(rawProfile);
  const skills = await loadSkills(personalInfoCollection);
  const resumeCatalog =
    account.resumeCatalog && typeof account.resumeCatalog === 'object' && !Array.isArray(account.resumeCatalog)
      ? account.resumeCatalog
      : {};

  const bundle = {
    applierName: account.name,
    vendorAllowed: Boolean(account.vendorAllowed),
    profile,
    skills,
    resumeCatalog,
    imapCredentials: {
      email: String(rawProfile.email ?? '').trim(),
      password: String(rawProfile.gmailAppPassword ?? '').replace(/\s/g, ''),
    },
    openAi: {
      apiKey: String(rawProfile.openaiApiKey ?? '').trim(),
      model: String(rawProfile.openaiModel ?? '').trim() || 'gpt-5-nano',
    },
  };

  let gmailTest = { ok: false, error: 'Gmail email or app password missing in lancer Profile.' };
  if (bundle.imapCredentials.email && bundle.imapCredentials.password) {
    gmailTest = await verifyImap(bundle.imapCredentials.email, bundle.imapCredentials.password);
  }

  const { checks, ready } = buildVerificationChecks(bundle, gmailTest);

  return {
    ready,
    applierName: account.name,
    profileId: account._id ? String(account._id) : null,
    accountExists: true,
    profileEmail: profile.email || null,
    checks,
  };
}

export async function updateOpenAiModel(accountInfoCollection, applierNameRaw, profileIdKeyRaw, modelRaw) {
  const applierName = String(applierNameRaw ?? '').trim();
  const profileIdKey = String(profileIdKeyRaw ?? '').trim();
  if (!applierName) {
    throw new Error('applierName is required.');
  }
  if (!profileIdKey) {
    throw new Error('profileIdKey is required.');
  }

  const account = await findAccountByApplierName(accountInfoCollection, applierName);
  if (!account) {
    throw new Error(`No account named "${applierName}".`);
  }

  const profileId = account._id ? String(account._id) : '';
  if (!profileId || profileId !== profileIdKey) {
    const error = new Error('Profile key does not match the loaded profile _id.');
    error.statusCode = 403;
    throw error;
  }

  const openaiModel = String(modelRaw ?? '').trim().slice(0, 64) || 'gpt-5-nano';
  await accountInfoCollection.updateOne(
    { _id: account._id },
    {
      $set: {
        'autoBidProfile.openaiModel': openaiModel,
        'autoBidProfile.updatedAt': new Date().toISOString(),
      },
    },
  );

  return { profileId, openaiModel };
}

export async function getPublicProfile(accountInfoCollection, personalInfoCollection, applierName) {
  const resolvedName = resolveApplierName(applierName);
  if (!resolvedName) {
    throw new Error('applierName is required. Set APPLIER_NAME in .env or pass applierName in the query.');
  }

  const account = await findAccountByApplierName(accountInfoCollection, resolvedName);
  if (!account) {
    return {
      accountExists: false,
      applierName: resolvedName,
      profile: buildPublicProfile({}),
      skills: await loadSkills(personalInfoCollection),
    };
  }

  return {
    accountExists: true,
    applierName: account.name,
    profile: buildPublicProfile(account.autoBidProfile || {}),
    skills: await loadSkills(personalInfoCollection),
  };
}
