import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AthensInput, AthensTextarea, FormField } from "../../../components/forms";
import { SlidePanel, SlidePanelHeader } from "../../../components/overlays";
import { Button } from "../../../components/ui/button";
import type { MailThread } from "../../../types";

type MailComposeSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (to: string, subject: string, body: string) => void | Promise<void>;
  sending?: boolean;
  replyTo?: MailThread | null;
};

export function MailComposeSheet({
  open,
  onOpenChange,
  onSend,
  sending = false,
  replyTo,
}: MailComposeSheetProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    if (replyTo) {
      setTo(replyTo.fromEmail || replyTo.from.replace(/^.*\(([^)]+)\).*$/, "$1") || "");
      setSubject(replyTo.subj.startsWith("Re:") ? replyTo.subj : `Re: ${replyTo.subj}`);
      setBody("");
    } else {
      setTo("");
      setSubject("");
      setBody("");
    }
  }, [open, replyTo]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || sending) return;
    await onSend(to, subject, body);
    setTo("");
    setSubject("");
    setBody("");
  };

  return (
    <SlidePanel open={open} onOpenChange={onOpenChange} width="md">
      <SlidePanelHeader title={replyTo ? "Reply" : "Compose"} onClose={() => onOpenChange(false)} />
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        <FormField label="To">
          <AthensInput value={to} onChange={(e) => setTo(e.target.value)} placeholder="recruiter@company.com" />
        </FormField>
        <FormField label="Subject">
          <AthensInput value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        <FormField label="Message">
          <AthensTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
        </FormField>
      </div>
      <div className="p-5 border-t border-border">
        <Button className="w-full" onClick={() => void handleSend()} disabled={sending}>
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Sending…
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </SlidePanel>
  );
}
