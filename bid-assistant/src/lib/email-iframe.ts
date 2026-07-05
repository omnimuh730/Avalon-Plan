import { applyDeepViewportFix, measureEmailDocumentHeight } from '@/lib/email-html';

const LAZY_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function setupLazyImages(
  iframe: HTMLIFrameElement,
  onLayoutChange: () => void,
): () => void {
  const doc = iframe.contentDocument;
  const view = doc?.defaultView;
  if (!doc?.body || !view) return () => undefined;

  const observers: IntersectionObserver[] = [];

  for (const img of doc.querySelectorAll<HTMLImageElement>('img')) {
    const originalSrc = img.getAttribute('src')?.trim();
    if (!originalSrc || originalSrc === LAZY_PLACEHOLDER) continue;

    img.dataset.gaSrc = originalSrc;
    img.removeAttribute('srcset');
    img.setAttribute('src', LAZY_PLACEHOLDER);
    img.classList.add('ga-lazy-img');
    img.setAttribute('loading', 'lazy');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLImageElement;
          const src = el.dataset.gaSrc;
          if (!src) continue;

          el.addEventListener(
            'load',
            () => {
              el.classList.add('ga-lazy-loaded');
              onLayoutChange();
            },
            { once: true },
          );
          el.addEventListener('error', () => el.classList.add('ga-lazy-loaded'), { once: true });
          el.src = src;
          observer.unobserve(el);
          onLayoutChange();
        }
      },
      { root: null, rootMargin: '120px', threshold: 0.01 },
    );

    observer.observe(img);
    observers.push(observer);
  }

  return () => {
    for (const observer of observers) observer.disconnect();
  };
}

export function enhanceEmailIframe(iframe: HTMLIFrameElement): () => void {
  const doc = iframe.contentDocument;
  if (!doc) return () => undefined;

  applyDeepViewportFix(doc);

  const applyHeight = () => {
    const height = measureEmailDocumentHeight(doc);
    iframe.style.height = `${Math.max(height, 120)}px`;
  };

  const cleanupLazy = setupLazyImages(iframe, applyHeight);

  applyHeight();
  requestAnimationFrame(applyHeight);
  window.setTimeout(applyHeight, 100);

  return cleanupLazy;
}
