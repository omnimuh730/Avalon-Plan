export interface FormFieldContext {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  options: string[];
  required: boolean;
}

export interface PageContext {
  url: string;
  title: string;
  metaDescription: string;
  visibleText: string;
  forms: FormFieldContext[];
  /** Frame URL when extracted via allFrames; useful for merging iframe content. */
  frameUrl?: string;
}

/** Diagnostics from allFrames scrape (iframe-aware ATS pages like iCIMS). */
export interface PageSourceMeta {
  visibleText: string;
  charCount: number;
  frameCount: number;
  frameUrls: string[];
  primaryFrameUrl: string | null;
}

const MAX_MERGED_TEXT_LENGTH = 15000;

/**
 * Injected into the active tab via chrome.scripting.executeScript.
 * Must stay fully self-contained: only this function body is serialized into
 * the page, so all helpers and constants have to live inside it.
 *
 * Runs once per frame when called with `allFrames: true` — each iframe that
 * hosts the real JD / application form (e.g. iCIMS) returns its own context.
 */
export function extractPageContext(): PageContext {
  const MAX_TEXT_LENGTH = 15000;

  const getMetaDescription = (): string => {
    const meta = document.querySelector('meta[name="description"]');
    return meta?.getAttribute('content')?.trim() ?? '';
  };

  const getFieldLabel = (element: HTMLElement): string => {
    const id = element.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent?.trim()) {
        return label.textContent.trim();
      }
    }

    const ariaLabel = element.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;

    const parentLabel = element.closest('label');
    if (parentLabel?.textContent?.trim()) {
      return parentLabel.textContent.trim();
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent?.trim()) {
        return labelEl.textContent.trim();
      }
    }

    return '';
  };

  const extractFormFields = (): FormFieldContext[] => {
    const fields: FormFieldContext[] = [];
    const elements = document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select');

    for (const element of elements) {
      const type =
        element instanceof HTMLSelectElement
          ? 'select'
          : element instanceof HTMLTextAreaElement
            ? 'textarea'
            : (element.type || 'text').toLowerCase();

      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') {
        continue;
      }

      const options: string[] = [];
      if (element instanceof HTMLSelectElement) {
        for (const option of element.options) {
          const text = option.textContent?.trim();
          if (text) options.push(text);
        }
      }

      const label = getFieldLabel(element);
      const placeholder = 'placeholder' in element ? (element.placeholder?.trim() ?? '') : '';
      const name = element.getAttribute('name')?.trim() ?? '';

      if (!label && !placeholder && !name && options.length === 0) {
        continue;
      }

      fields.push({
        label,
        name,
        type,
        placeholder,
        options: options.slice(0, 20),
        required: element.required,
      });
    }

    return fields.slice(0, 50);
  };

  const visibleText = (document.body?.innerText ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  return {
    url: location.href,
    title: document.title.trim(),
    metaDescription: getMetaDescription(),
    visibleText,
    forms: extractFormFields(),
    frameUrl: location.href,
  };
}

function formFieldKey(field: FormFieldContext): string {
  return `${field.type}|${field.name}|${field.label}|${field.placeholder}`.toLowerCase();
}

function isUsefulFrame(ctx: PageContext): boolean {
  const url = (ctx.frameUrl || ctx.url || '').toLowerCase();
  if (url.startsWith('about:blank') || url.startsWith('javascript:')) {
    return (ctx.forms?.length ?? 0) > 0;
  }
  return ctx.visibleText.length >= 40 || (ctx.forms?.length ?? 0) > 0;
}

/**
 * Merge per-frame extraction results so ATS pages that host the JD / form in
 * an iframe (iCIMS, some Workday embeds, etc.) still yield full context.
 *
 * Prefers the longest visible-text frame for the JD body, then appends other
 * substantial frames that aren't already covered. Forms are unioned.
 * Job/ATS iframe hosts (icims, greenhouse, etc.) get a tie-break boost over
 * short parent chrome when text lengths are within 20%.
 */
export function mergePageContexts(
  frames: PageContext[],
  topLevel?: { url?: string; title?: string },
): (PageContext & { sourceMeta: PageSourceMeta }) | null {
  const useful = frames.filter((frame) => frame && isUsefulFrame(frame));
  if (useful.length === 0) return null;

  const scoreFrame = (ctx: PageContext): number => {
    const url = (ctx.frameUrl || ctx.url || '').toLowerCase();
    let boost = 0;
    if (/icims\.com|greenhouse\.io|lever\.co|myworkdayjobs|ashbyhq\.com|jobvite|smartrecruiters/.test(url)) {
      boost += 2000;
    }
    if (/\/job|\/jobs|\/application|\/apply/.test(url)) boost += 500;
    return ctx.visibleText.length + boost;
  };

  const ranked = [...useful].sort((a, b) => scoreFrame(b) - scoreFrame(a));
  const primary = ranked[0];

  const textParts: string[] = [];
  let remaining = MAX_MERGED_TEXT_LENGTH;
  for (const frame of ranked) {
    const text = frame.visibleText.trim();
    if (!text || remaining <= 0) continue;
    // Skip text already covered by a longer frame we kept.
    if (textParts.some((part) => part.includes(text))) continue;
    const chunk = text.slice(0, remaining);
    textParts.push(chunk);
    remaining -= chunk.length + 1;
  }

  const seenForms = new Set<string>();
  const forms: FormFieldContext[] = [];
  for (const frame of ranked) {
    for (const field of frame.forms ?? []) {
      const key = formFieldKey(field);
      if (seenForms.has(key)) continue;
      seenForms.add(key);
      forms.push(field);
      if (forms.length >= 50) break;
    }
    if (forms.length >= 50) break;
  }

  const topUrl = topLevel?.url?.trim() || '';
  const topTitle = topLevel?.title?.trim() || '';
  const visibleText = textParts.join('\n\n').slice(0, MAX_MERGED_TEXT_LENGTH);
  const frameUrls = ranked
    .map((f) => f.frameUrl || f.url)
    .filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i);

  return {
    url: topUrl || primary.url,
    title: topTitle || primary.title,
    metaDescription: primary.metaDescription || ranked.find((f) => f.metaDescription)?.metaDescription || '',
    visibleText,
    forms,
    frameUrl: primary.frameUrl || primary.url,
    sourceMeta: {
      visibleText,
      charCount: visibleText.length,
      frameCount: useful.length,
      frameUrls,
      primaryFrameUrl: primary.frameUrl || primary.url || null,
    },
  };
}
