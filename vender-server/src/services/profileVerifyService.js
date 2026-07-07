function hasFilledEducation(education) {
  if (!Array.isArray(education)) return false;
  return education.some((entry) => String(entry?.school ?? '').trim() || String(entry?.diploma ?? '').trim());
}

function hasFilledCareer(careers) {
  if (!Array.isArray(careers)) return false;
  return careers.some((entry) => String(entry?.company ?? '').trim() || String(entry?.title ?? '').trim());
}

function countResumeStacks(resumeCatalog) {
  if (!resumeCatalog || typeof resumeCatalog !== 'object' || Array.isArray(resumeCatalog)) {
    return 0;
  }
  return Object.values(resumeCatalog).filter(
    (skills) => skills && typeof skills === 'object' && !Array.isArray(skills) && Object.keys(skills).length > 0,
  ).length;
}

function checkProfileCompleteness(profile) {
  const missing = [];

  const fullName = String(profile.fullName ?? '').trim();
  const firstName = String(profile.firstName ?? '').trim();
  const lastName = String(profile.lastName ?? '').trim();
  if (!fullName && !(firstName && lastName)) {
    missing.push('full name');
  }
  if (!String(profile.email ?? '').trim()) missing.push('email');
  if (!String(profile.phone ?? '').trim()) missing.push('phone');
  if (!hasFilledEducation(profile.education) && !hasFilledCareer(profile.careers)) {
    missing.push('education or work history');
  }

  return {
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? 'Profile fields look complete.'
        : `Missing in lancer Profile: ${missing.join(', ')}.`,
    missing,
  };
}

function checkResumeCatalog(resumeCatalog) {
  const stackCount = countResumeStacks(resumeCatalog);
  return {
    ok: stackCount > 0,
    message:
      stackCount > 0
        ? `${stackCount} resume stack${stackCount === 1 ? '' : 's'} loaded.`
        : 'No resume stacks saved. Paste resumes.json under Settings → Resume in lancer-frontend.',
    stackCount,
  };
}

function checkOpenAi(openAi) {
  const hasKey = Boolean(String(openAi?.apiKey ?? '').trim());
  return {
    ok: hasKey,
    message: hasKey
      ? `OpenAI key configured (${openAi.model || 'gpt-4o-mini'}).`
      : 'OpenAI API key missing. Add it under Settings → Profile in lancer-frontend.',
    model: openAi?.model || null,
  };
}

function checkGmailConfigured(imapCredentials) {
  const email = String(imapCredentials?.email ?? '').trim();
  const password = String(imapCredentials?.password ?? '').replace(/\s/g, '');
  if (!email || !password) {
    return {
      ok: false,
      message: 'Gmail email or app password missing in lancer Profile.',
      email: email || null,
      tested: false,
    };
  }
  return {
    ok: true,
    message: 'Gmail credentials present — testing IMAP connection…',
    email,
    tested: false,
  };
}

function checkVendorAccess(vendorAllowed) {
  return {
    ok: Boolean(vendorAllowed),
    message: vendorAllowed
      ? 'Vendor access enabled for this profile.'
      : 'Vendor access is disabled. Enable "Allow vendor access" in lancer Profile settings.',
  };
}

export function buildVerificationChecks(bundle, gmailTest) {
  const vendorAccess = checkVendorAccess(bundle.vendorAllowed);
  const profile = checkProfileCompleteness(bundle.profile);
  const resume = checkResumeCatalog(bundle.resumeCatalog);
  const openai = checkOpenAi(bundle.openAi);
  const gmailConfigured = checkGmailConfigured(bundle.imapCredentials);

  const gmail = gmailTest
    ? {
        ok: gmailTest.ok,
        message: gmailTest.ok
          ? `Gmail connected (${gmailConfigured.email}).`
          : gmailTest.error || 'Gmail IMAP connection failed.',
        email: gmailConfigured.email,
        tested: true,
      }
    : {
        ...gmailConfigured,
        ok: false,
        message: gmailConfigured.ok ? gmailConfigured.message : gmailConfigured.message,
        tested: false,
      };

  const checks = { vendorAccess, profile, resume, openai, gmail };
  const ready = vendorAccess.ok && profile.ok && resume.ok && openai.ok && gmail.ok;

  return { checks, ready };
}

export { countResumeStacks, checkProfileCompleteness };
