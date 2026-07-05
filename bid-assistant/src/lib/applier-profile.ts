export type ProfileCheck = {
  ok: boolean;
  message: string;
  missing?: string[];
  stackCount?: number;
  model?: string | null;
  email?: string | null;
  tested?: boolean;
};

export type BridgeStatus = {
  running: boolean;
  mongoConnected: boolean;
  mongoError: string | null;
};

export type ProfileVerification = {
  ready: boolean;
  applierName: string;
  profileId?: string | null;
  accountExists?: boolean;
  profileEmail?: string | null;
  checks: {
    vendorAccess: ProfileCheck;
    profile: ProfileCheck;
    resume: ProfileCheck;
    openai: ProfileCheck;
    gmail: ProfileCheck;
  };
};

export type StoredApplierState = {
  applierName: string | null;
  profileId: string | null;
  ready: boolean;
  checks: ProfileVerification['checks'] | null;
  profileEmail: string | null;
};

function sendMessage<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export async function getApplierState(): Promise<StoredApplierState> {
  const response = await sendMessage<
    { ok: true; state: StoredApplierState } | { ok: false; error: string }
  >({ type: 'GET_APPLIER_STATE' });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load applier state');
  }
  return response.state;
}

export async function loadApplierProfile(applierName: string): Promise<ProfileVerification> {
  const response = await sendMessage<
    { ok: true; verification: ProfileVerification } | { ok: false; error: string }
  >({ type: 'LOAD_APPLIER_PROFILE', applierName });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load profile');
  }
  return response.verification;
}

export async function clearApplierProfile(): Promise<void> {
  const response = await sendMessage<{ ok: true } | { ok: false; error: string }>({
    type: 'CLEAR_APPLIER_PROFILE',
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to clear profile');
  }
}
