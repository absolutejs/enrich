import { isFreeProvider } from "./classify";
import { mxHostsFor } from "./dns";
import {
  applyTemplate,
  parseName,
  templatedCandidates,
  type NameInput,
  type PatternTemplate,
  type TemplatedCandidate,
} from "./patterns";
import type { EmailVerifier } from "./verifier";

const MAX_CANDIDATES = 6; // cap probes — be polite + economical with the verifier
const CONFIDENCE_SMTP_OK = 95;
const CONFIDENCE_CATCH_ALL = 60;
const CONFIDENCE_KNOWN_PATTERN = 75; // a learned per-domain pattern, unverified
const CONFIDENCE_MX_ONLY = 45;

export type FindEmailInput = NameInput & {
  /** Company domain (or website URL — only the host is used). */
  domain: string;
};

export type FindEmailResult = {
  email: string;
  status: "deliverable" | "risky" | "unknown";
  confidence: number;
  /** The shape that matched — store it per domain to skip probing next time. */
  template: PatternTemplate;
  catchAll: boolean;
};

export type FindEmailOptions = {
  /** The confirm step. Omit to stay discovery-only (MX + best-guess pattern,
   *  no SMTP / no third-party call). */
  verifier?: EmailVerifier;
  /** A pattern already learned for this domain — applied directly, skipping
   *  candidate probing entirely (verified too if a verifier is given). */
  knownPattern?: PatternTemplate;
  /** Max candidates to try against the verifier (default 6). */
  maxCandidates?: number;
};

const bareDomain = (value: string) => {
  const trimmed = value.trim().toLowerCase().replace(/^@/, "");
  if (!/^https?:\/\//.test(trimmed) && !trimmed.includes("/")) return trimmed;
  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return trimmed;
  }
};

// Find the most likely email for a person at a company. Order of preference:
//   1. a known per-domain pattern → applied directly (and verified if possible),
//   2. with a verifier → the best candidate it confirms deliverable,
//   3. otherwise → the top pattern at MX-only confidence (no probing).
// Returns null when the domain doesn't accept mail / there's nothing to guess
// from. Never opens an SMTP connection itself — that lives behind a verifier.
export const findEmail = async (
  input: FindEmailInput,
  options: FindEmailOptions = {},
): Promise<FindEmailResult | null> => {
  const domain = bareDomain(input.domain);
  if (!domain || isFreeProvider(domain)) return null;
  const name = parseName(input);
  if (!name) return null;

  // 1. Known pattern — apply it straight away.
  if (options.knownPattern) {
    const email = applyTemplate(options.knownPattern, name, domain);
    if (email) {
      if (!options.verifier) {
        return {
          catchAll: false,
          confidence: CONFIDENCE_KNOWN_PATTERN,
          email,
          status: "unknown",
          template: options.knownPattern,
        };
      }
      const verdict = await options.verifier(email);

      return {
        catchAll: verdict.catchAll ?? false,
        confidence: verdict.confidence,
        email,
        status: verdict.status === "deliverable" ? "deliverable" : "risky",
        template: options.knownPattern,
      };
    }
  }

  const candidates = templatedCandidates(name, domain).slice(
    0,
    options.maxCandidates ?? MAX_CANDIDATES,
  );
  const [top] = candidates;
  if (!top) return null;

  // MX gate — does the domain accept mail at all?
  const [primaryMx] = await mxHostsFor(domain);
  if (!primaryMx) return null;

  // 3. No verifier → best-guess at MX-only confidence (no probing).
  if (!options.verifier) {
    return {
      catchAll: false,
      confidence: CONFIDENCE_MX_ONLY,
      email: top.email,
      status: "unknown",
      template: top.template,
    };
  }

  // 2. Verifier → confirm candidates best-first.
  const verifier = options.verifier;
  const confirm = async (
    remaining: TemplatedCandidate[],
  ): Promise<FindEmailResult | null> => {
    const [head, ...rest] = remaining;
    if (!head) return null;
    const verdict = await verifier(head.email);
    if (verdict.catchAll) {
      return {
        catchAll: true,
        confidence: CONFIDENCE_CATCH_ALL,
        email: top.email,
        status: "risky",
        template: top.template,
      };
    }
    if (verdict.status === "deliverable") {
      return {
        catchAll: false,
        confidence: verdict.confidence || CONFIDENCE_SMTP_OK,
        email: head.email,
        status: "deliverable",
        template: head.template,
      };
    }

    return confirm(rest);
  };

  return confirm(candidates);
};
