import { toast } from "sonner";

export type NotifyTone = "success" | "info" | "warning" | "error" | "magic";
export type NotifyOpts = { title?: string; description?: string; tone?: NotifyTone; durationMs?: number };

export function useNotify() {
  const notify = (opts: NotifyOpts | string) => {
    const o: NotifyOpts = typeof opts === "string" ? { title: opts } : opts;
    const title = o.title ?? "";
    const description = o.description;
    switch (o.tone) {
      case "error":
        toast.error(title, { description });
        break;
      case "warning":
        toast.warning(title, { description });
        break;
      case "info":
        toast.info(title, { description });
        break;
      default:
        toast.success(title, { description });
        break;
    }
  };
  return { notify };
}
