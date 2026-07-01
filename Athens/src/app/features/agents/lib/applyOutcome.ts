/**
 * Decide whether an application succeeded by reading the page after submit.
 * Purely language/structure based (innerText cues + whether any fillable control
 * remains) — no vendor or site-specific strings, per Guide.md.
 */

const SUCCESS_CUES =
  /\b(thank you|thanks for applying|application (was |has been )?(received|submitted|sent|complete[d]?)|successfully (submitted|applied|sent)|we('| ha)ve received your application|your application (has been|was) (received|submitted|sent)|submission (received|complete)|applied successfully|no longer accepting)\b/i;

const ERROR_CUES =
  /\b(is required|this field|please (fill|complete|correct|enter|select|provide)|required field|cannot be (blank|empty)|must be|invalid|enter a valid|fix the (errors|following)|there (was|were) (an? )?error)\b/i;

export interface ApplyPageState {
  /** Page innerText (trimmed/truncated). */
  text: string;
  /** Count of still-fillable controls (visible inputs/textareas/selects/contenteditable). */
  controlCount: number;
  /** Whether the executor reported it clicked a submit control. */
  submitted: boolean;
}

export interface ApplyOutcome {
  applied: boolean;
  reason: string;
}

export function classifyApplyOutcome(state: ApplyPageState): ApplyOutcome {
  const text = state.text || "";

  if (SUCCESS_CUES.test(text)) {
    return { applied: true, reason: "Confirmation text detected" };
  }
  // No fillable controls left → nothing more to submit. Covers the "submitted but
  // flagged as spam / no form present" case the user described — treat as applied.
  if (state.controlCount === 0) {
    return { applied: true, reason: "No form left to fill" };
  }
  if (ERROR_CUES.test(text)) {
    return { applied: false, reason: "Validation/error text on the page" };
  }
  // Ambiguous: lean on whether we actually clicked submit.
  if (state.submitted) {
    return { applied: true, reason: "Submitted with no visible errors" };
  }
  return { applied: false, reason: "Could not confirm submission" };
}
