import { isFreeProvider } from "./classify";
import { mxHostsFor, randomLocalpart } from "./dns";
import { emailPatterns, parseName, type NameInput } from "./patterns";
import { probeMailbox } from "./smtp";
import type { VerifyOptions } from "./verify";

const SMTP_ACCEPTED = 250;
const MAX_PROBE_PATTERNS = 6; // stay polite — most servers rate-limit many RCPTs
const CONFIDENCE_SMTP_OK = 95;
const CONFIDENCE_CATCH_ALL = 60;
const CONFIDENCE_MX_ONLY = 45;

export type FindEmailInput = NameInput & {
  /** Company domain (or website URL — only the host is used). */
  domain: string;
};

export type FindEmailResult = {
  email: string;
  status: "deliverable" | "risky" | "unknown";
  confidence: number;
  /** The local-part shape that matched (e.g. "first.last") — reuse it to guess
   *  other people at the same company without re-probing. */
  pattern: string;
  catchAll: boolean;
};

export type FindEmailOptions = VerifyOptions;

const localOf = (email: string) => email.slice(0, email.lastIndexOf("@"));

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

// Find the most likely deliverable email for a person at a company: generate the
// corporate patterns, then resolve them on the company's mail server. Returns
// the SMTP-confirmed address when possible, the top pattern at catch-all/MX-only
// confidence when the server won't confirm, or null when the domain doesn't
// accept mail / there's nothing to guess from.
export const findEmail = async (
  input: FindEmailInput,
  options: FindEmailOptions = {},
): Promise<FindEmailResult | null> => {
  const domain = bareDomain(input.domain);
  // Consumer-mailbox addresses aren't pattern-guessable from a name.
  if (!domain || isFreeProvider(domain)) return null;
  const name = parseName(input);
  if (!name) return null;
  const candidates = emailPatterns(name, domain).slice(0, MAX_PROBE_PATTERNS);
  const [topCandidate] = candidates;
  if (!topCandidate) return null;

  const [primaryMx] = await mxHostsFor(domain);
  if (!primaryMx) return null; // domain doesn't accept mail

  const mxOnly: FindEmailResult = {
    catchAll: false,
    confidence: CONFIDENCE_MX_ONLY,
    email: topCandidate,
    pattern: localOf(topCandidate),
    status: "unknown",
  };
  if (options.skipSmtp) return mxOnly;

  const codes = await probeMailbox(
    primaryMx,
    [`${randomLocalpart()}@${domain}`, ...candidates],
    options,
  );
  if (!codes) return mxOnly; // smtp unreachable — best guess at MX confidence

  const [randomCode, ...candidateCodes] = codes;
  if (randomCode === SMTP_ACCEPTED) {
    return {
      catchAll: true,
      confidence: CONFIDENCE_CATCH_ALL,
      email: topCandidate,
      pattern: localOf(topCandidate),
      status: "risky",
    };
  }
  const hitIndex = candidateCodes.findIndex((code) => code === SMTP_ACCEPTED);
  const hit = hitIndex === -1 ? undefined : candidates[hitIndex];
  if (!hit) return null; // none of the patterns resolved

  return {
    catchAll: false,
    confidence: CONFIDENCE_SMTP_OK,
    email: hit,
    pattern: localOf(hit),
    status: "deliverable",
  };
};
