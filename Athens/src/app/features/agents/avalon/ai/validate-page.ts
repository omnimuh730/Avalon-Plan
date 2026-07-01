import { chatCompletion } from "./client";
import type { JsonSchemaDefinition } from "./chat-types";
import { toAiUsage, type AiUsage } from "./verify-apply";

/**
 * AI check that an opened job link is actually a live application form worth
 * filling — before we spend a scan/analyze/fill on it. Language-based only (reads
 * the page text + control count); no vendor/site strings, per Guide.md.
 */

export type PageValidityKind =
  | "application_form" // valid — a fillable job application form
  | "expired" // posting closed / no longer accepting applications
  | "not_found" // 404 / page does not exist
  | "error" // page failed to load / error page
  | "not_a_form"; // a real page but not an application form (job description only, login wall, etc.)

const VALIDATE_SYSTEM_PROMPT = [
  "You decide whether an opened URL is a LIVE job-application FORM that can be filled and submitted.",
  "You are given the page's visible text, its title, and how many fillable form controls it has.",
  "Classify into exactly one kind:",
  "- application_form: a real, open application form with fields to fill (name/email/résumé/etc.).",
  "- expired: the posting is closed / no longer accepting applications / position filled.",
  "- not_found: 404 / page or job does not exist / invalid link.",
  "- error: the page failed to load, shows an error, or is blank with no form.",
  "- not_a_form: a valid page but NOT an application form (e.g. only a job description with an",
  "  'Apply' link not yet clicked, a login/SSO wall, a listings page).",
  "A high control count with typical application labels strongly implies application_form.",
  "A control count of 0 with 'not found', 'no longer', 'closed', 'expired' text implies expired/not_found.",
  "Judge only from the given text + control count.",
].join("\n");

export const PAGE_VALIDITY_SCHEMA: JsonSchemaDefinition = {
  name: "page_validity",
  description: "Whether an opened URL is a fillable job application form.",
  strict: true,
  schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["application_form", "expired", "not_found", "error", "not_a_form"],
      },
      reason: { type: "string", description: "One short sentence citing the page text/title that decided it." },
    },
    required: ["kind", "reason"],
    additionalProperties: false,
  },
};

export interface PageValidityResult {
  kind: PageValidityKind;
  valid: boolean;
  reason: string;
  usage?: AiUsage;
}

export async function validateJobPage(params: {
  text: string;
  title?: string;
  url?: string;
  fieldCount: number;
  controlCount?: number;
}): Promise<PageValidityResult> {
  const text = (params.text || "").slice(0, 5000);
  const response = await chatCompletion({
    system: VALIDATE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          params.title ? `Title: ${params.title}` : "",
          params.url ? `URL: ${params.url}` : "",
          `Fillable form fields discovered: ${params.fieldCount}`,
          params.controlCount != null ? `Visible controls: ${params.controlCount}` : "",
          "Page text:",
          "```",
          text,
          "```",
          "Return kind + reason.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    responseSchema: PAGE_VALIDITY_SCHEMA,
    temperature: 0,
  });

  const usage = toAiUsage(response.usage);
  const structured = response.structured as { kind?: PageValidityKind; reason?: string } | undefined;
  const kind = structured?.kind;
  const valid = kind === "application_form";
  if (kind) return { kind, valid, reason: structured?.reason || "", usage };
  // If the classifier fails but we clearly saw form fields, don't block the apply.
  return {
    kind: params.fieldCount > 0 ? "application_form" : "error",
    valid: params.fieldCount > 0,
    reason: "Validity classifier returned no result",
    usage,
  };
}
