import { useState } from "react";
import { toast } from "sonner";
import { AthensInput, FormField } from "../../../components/forms";

export function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const save = () => {
    if (!current || !next || next !== confirm) {
      toast.error("Please fill all fields and ensure passwords match");
      return;
    }
    toast.success("Password updated");
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Security</h2>
        <p className="text-sm text-muted-foreground">Update your account password</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
        <FormField label="Current password">
          <AthensInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
        <FormField label="New password">
          <AthensInput type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormField>
        <FormField label="Confirm new password">
          <AthensInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
        <button type="button" onClick={save} className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
          Update password
        </button>
      </div>
    </div>
  );
}
