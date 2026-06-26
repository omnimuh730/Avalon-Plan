import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

type AddProfileSkillPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSkill: string;
  onConfirm: (skill: string) => void | Promise<void>;
  saving?: boolean;
};

export function AddProfileSkillPanel({
  open,
  onOpenChange,
  initialSkill,
  onConfirm,
  saving = false,
}: AddProfileSkillPanelProps) {
  const [draft, setDraft] = useState(initialSkill);

  useEffect(() => {
    if (open) setDraft(initialSkill);
  }, [open, initialSkill]);

  if (!open) return null;

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !saving;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    await onConfirm(trimmed);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => !saving && onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-profile-skill-title"
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-profile-skill-title" className="text-lg font-semibold">
          Add to your profile?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This skill will be saved to your profile and used for future job match scores.
          Related requirements match via normalized text containment.
        </p>

        <div className="mt-4 space-y-2">
          <Label htmlFor="profile-skill-draft">Skill name</Label>
          <Input
            id="profile-skill-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Full Stack, C++, Software"
            disabled={saving}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
          {initialSkill && trimmed.toLowerCase() !== initialSkill.trim().toLowerCase() ? (
            <p className="text-xs text-muted-foreground">
              From job requirement: <span className="font-medium text-foreground">{initialSkill}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleConfirm()}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              "Add to profile"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
