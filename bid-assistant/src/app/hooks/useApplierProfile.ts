import { useCallback, useEffect, useState } from 'react';
import {
  getApplierState,
  loadApplierProfile,
  type ProfileVerification,
  type StoredApplierState,
} from '@/lib/applier-profile';
import { getBridgeStatus, type BridgeStatus } from '@/lib/gmail';

const emptyState: StoredApplierState = {
  applierName: null,
  profileId: null,
  ready: false,
  checks: null,
  profileEmail: null,
};

const idleBridgeStatus: BridgeStatus = {
  running: false,
  mongoConnected: false,
  mongoError: null,
};

function bridgeErrorMessage(status: BridgeStatus): string | null {
  if (!status.running) {
    return status.mongoError ?? 'Bridge is not running. Start vender-server with npm run bridge.';
  }
  if (!status.mongoConnected) {
    return status.mongoError ?? 'Database is not connected. Check MONGO_URL in vender-server/.env.';
  }
  return null;
}

export function useApplierProfile() {
  const [inputName, setInputName] = useState('');
  const [state, setState] = useState<StoredApplierState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(idleBridgeStatus);
  const [error, setError] = useState<string | null>(null);
  const [lastVerification, setLastVerification] = useState<ProfileVerification | null>(null);

  const refresh = useCallback(async () => {
    const [applierState, status] = await Promise.all([getApplierState(), getBridgeStatus()]);
    setState(applierState);
    setBridgeStatus(status);
    setInputName((prev) => prev || applierState.applierName || '');
    return applierState;
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await getBridgeStatus();
        setBridgeStatus(status);
        const bridgeErr = bridgeErrorMessage(status);
        if (bridgeErr) {
          setError(bridgeErr);
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile state');
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const loadProfile = useCallback(async () => {
    const name = inputName.trim();
    if (!name) {
      setError('Type an applier name first.');
      return null;
    }

    setVerifying(true);
    setError(null);
    try {
      const status = await getBridgeStatus();
      setBridgeStatus(status);
      const bridgeErr = bridgeErrorMessage(status);
      if (bridgeErr) {
        throw new Error(bridgeErr);
      }

      const verification = await loadApplierProfile(name);
      setLastVerification(verification);
      await refresh();
      if (!verification.ready) {
        setError('Profile loaded with issues — fix the items below in lancer-frontend.');
      }
      return verification.ready ? verification : null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify profile');
      setLastVerification(null);
      await refresh();
      return null;
    } finally {
      setVerifying(false);
    }
  }, [inputName, refresh]);

  const bridgeRunning = bridgeStatus.running && bridgeStatus.mongoConnected;

  return {
    inputName,
    setInputName,
    state,
    loading,
    verifying,
    bridgeStatus,
    bridgeRunning,
    error,
    lastVerification,
    checks: lastVerification?.checks ?? state.checks,
    ready: state.ready,
    applierName: state.applierName,
    loadProfile,
    refresh,
  };
}
