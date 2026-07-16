import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertCircle, Loader2 } from "lucide-react";

/**
 * YouTube-style player fed by a signed Firebase Storage URL.
 * Signing is resolved by the caller (useRecordingUrl).
 */
export function MediaPlayerModal({
  open,
  title,
  subtitle,
  src,
  loading = false,
  error = null,
  pathHint,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  src: string | null;
  loading?: boolean;
  error?: string | null;
  pathHint?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bm-player-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="bm-player"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bm-player-top">
              <div>
                <h2 className="bm-player-title">{title}</h2>
                {subtitle ? <p className="bm-player-sub">{subtitle}</p> : null}
              </div>
              <button type="button" className="bm-player-close" onClick={onClose} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bm-player-stage">
              {loading ? (
                <div className="bm-player-state">
                  <Loader2 className="w-7 h-7 animate-spin" />
                  <span>Signing stream…</span>
                </div>
              ) : error ? (
                <div className="bm-player-state">
                  <AlertCircle className="w-7 h-7" />
                  <span>{error}</span>
                </div>
              ) : src ? (
                <video
                  key={src}
                  className="bm-player-video"
                  src={src}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                >
                  <track kind="captions" />
                </video>
              ) : (
                <div className="bm-player-state">
                  <AlertCircle className="w-7 h-7" />
                  <span>No preview available</span>
                </div>
              )}
            </div>

            {pathHint ? <div className="bm-player-path">{pathHint}</div> : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
