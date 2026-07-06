import { useEffect, useState } from 'react';
import { Settings, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { clearCredentials, getCredentials, saveCredentials } from '@/lib/gmail';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  bridgeRunning: boolean;
}

export function SettingsPanel({ open, onClose, onSaved, bridgeRunning }: SettingsPanelProps) {
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    void (async () => {
      const credentials = await getCredentials();
      setEmail(credentials?.email ?? '');
      setAppPassword(credentials?.appPassword ?? '');
      setError(null);
    })();
  }, [open]);

  if (!open) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await saveCredentials({ email, appPassword });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);

    try {
      await clearCredentials();
      setEmail('');
      setAppPassword('');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#202020]">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          <h2 className="font-medium">Gmail Settings</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-gray-200">
          Close
        </Button>
      </div>

      <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="rounded-lg border border-gray-800 bg-[#202020] p-3 text-sm text-gray-400 space-y-2">
          <p>
            Use a Gmail <strong className="text-gray-300">App Password</strong> (not your regular password).
            Enable 2-Step Verification, then create one at{' '}
            <span className="text-blue-400">Google Account → Security → App passwords</span>.
          </p>
          <div className="flex items-center gap-2 text-xs">
            {bridgeRunning ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-400">IMAP bridge is running</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-400">Run `npm run bridge` before fetching mail</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gmail-email" className="text-gray-300">
            Gmail address
          </Label>
          <Input
            id="gmail-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            required
            className="bg-[#202020] border-gray-700 text-gray-100"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gmail-app-password" className="text-gray-300">
            App password
          </Label>
          <Input
            id="gmail-app-password"
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="16-character app password"
            required
            className="bg-[#202020] border-gray-700 text-gray-100"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & connect'}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={handleClear}>
            Clear
          </Button>
        </div>
      </form>
    </div>
  );
}
