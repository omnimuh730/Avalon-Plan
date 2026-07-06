import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { resolveDisplayHtml } from '@/lib/email-html';
import { enhanceEmailIframe } from '@/lib/email-iframe';

interface EmailBodyProps {
  body: string;
  bodyHtml?: string | null;
}

function PlainTextBody({ body }: { body: string }) {
  const text = body.trim() || '(No text content)';
  return (
    <div className="rounded-lg bg-[#2a2a2a] p-4 text-sm leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
      {text}
    </div>
  );
}

export function EmailBody({ body, bodyHtml }: EmailBodyProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const hasHtml = Boolean(bodyHtml?.trim());
  const plainBody = body.trim();

  const [htmlReady, setHtmlReady] = useState(false);
  const deferredHtml = useDeferredValue(htmlReady ? bodyHtml : null);

  useEffect(() => {
    if (!hasHtml) {
      setHtmlReady(false);
      return;
    }

    setHtmlReady(false);
    const frame = window.requestAnimationFrame(() => {
      setHtmlReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bodyHtml, hasHtml]);

  const srcDoc = useMemo(() => {
    if (!deferredHtml?.trim()) return null;
    return resolveDisplayHtml(deferredHtml, body);
  }, [body, deferredHtml]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcDoc) return;

    const onLoad = () => {
      cleanupRef.current?.();
      cleanupRef.current = enhanceEmailIframe(iframe);
    };

    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [srcDoc]);

  if (!hasHtml) {
    return <PlainTextBody body={plainBody} />;
  }

  return (
    <div className="space-y-3">
      {plainBody && plainBody !== '(No text content)' && !htmlReady && (
        <PlainTextBody body={plainBody} />
      )}

      {htmlReady && srcDoc ? (
        <iframe
          ref={iframeRef}
          title="Email message"
          sandbox="allow-same-origin"
          scrolling="no"
          className="w-full border-0 bg-transparent block"
          srcDoc={srcDoc}
        />
      ) : (
        !plainBody && (
          <div className="rounded-lg bg-[#2a2a2a] p-4 text-sm text-gray-500">Rendering HTML…</div>
        )
      )}
    </div>
  );
}
