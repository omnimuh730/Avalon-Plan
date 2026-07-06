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
}

/**
 * Injected into the active tab via chrome.scripting.executeScript.
 * Must stay fully self-contained: only this function body is serialized into
 * the page, so all helpers and constants have to live inside it.
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
  };
}
