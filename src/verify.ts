import { isDisposableDomain, isFreeProvider, isRoleLocalpart } from "./classify";
import { mxHostsFor, randomLocalpart } from "./dns";
import { probeMailbox, type SmtpProbeOptions } from "./smtp";

const SMTP_ACCEPTED = 250;
// Confidence (0–100), mirroring how commercial verifiers report it.
const CONFIDENCE_SMTP_OK = 95; // SMTP-confirmed on a non-catch-all domain
const CONFIDENCE_CATCH_ALL = 60; // domain accepts everything — can't confirm
const CONFIDENCE_MX_ONLY = 45; // domain accepts mail, SMTP inconclusive

export type EmailStatus =
  | "deliverable"
  | "risky"
  | "undeliverable"
  | "unknown";

export type VerifyResult = {
  email: string;
  status: EmailStatus;
  confidence: number;
  mxFound: boolean;
  catchAll: boolean;
  disposable: boolean;
  freeProvider: boolean;
  role: boolean;
  reason: string;
};

export type VerifyOptions = SmtpProbeOptions & {
  /** Skip the SMTP probe (MX + heuristics only) — useful where port 25 egress
   *  is blocked. Result tops out at "unknown" / MX-only confidence. */
  skipSmtp?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// Verify a single email: syntax → disposable/free/role heuristics → MX → SMTP
// (catch-all probe + RCPT) → confidence. Best-effort and non-throwing: an
// unreachable SMTP layer degrades to "unknown" with MX-only confidence, never a
// false "undeliverable".
export const verifyEmail = async (
  email: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> => {
  const normalized = email.trim().toLowerCase();
  const flags = {
    catchAll: false,
    disposable: false,
    email: normalized,
    freeProvider: false,
    mxFound: false,
    role: false,
  };
  if (!EMAIL_RE.test(normalized)) {
    return { ...flags, confidence: 0, reason: "invalid syntax", status: "undeliverable" };
  }
  const atIndex = normalized.lastIndexOf("@");
  const localpart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const disposable = isDisposableDomain(domain);
  const freeProvider = isFreeProvider(domain);
  const role = isRoleLocalpart(localpart);
  const classified = { ...flags, disposable, freeProvider, role };
  if (disposable) {
    return { ...classified, confidence: 0, reason: "disposable domain", status: "undeliverable" };
  }

  const mxHosts = await mxHostsFor(domain);
  const [primaryMx] = mxHosts;
  if (!primaryMx) {
    return { ...classified, confidence: 0, reason: "no MX records", status: "undeliverable" };
  }
  const withMx = { ...classified, mxFound: true };

  // Free consumer providers exist in DNS but their SMTP layer says "everyone
  // exists", and they aren't a company address → risky, not confirmable.
  if (freeProvider) {
    return { ...withMx, confidence: CONFIDENCE_MX_ONLY, reason: "free consumer provider", status: "risky" };
  }
  if (options.skipSmtp) {
    return { ...withMx, confidence: CONFIDENCE_MX_ONLY, reason: "mx ok, smtp skipped", status: "unknown" };
  }

  // One session: a random local-part (catch-all probe) then the real address.
  const randomProbe = `${randomLocalpart()}@${domain}`;
  const codes = await probeMailbox(primaryMx, [randomProbe, normalized], options);
  if (!codes) {
    return {
      ...withMx,
      confidence: CONFIDENCE_MX_ONLY,
      reason: "smtp unreachable (port 25 blocked or greylisted)",
      status: "unknown",
    };
  }
  const [randomCode, realCode] = codes;
  if (randomCode === SMTP_ACCEPTED) {
    return {
      ...withMx,
      catchAll: true,
      confidence: CONFIDENCE_CATCH_ALL,
      reason: "catch-all domain — mailbox unconfirmable",
      status: "risky",
    };
  }
  if (realCode === SMTP_ACCEPTED) {
    return {
      ...withMx,
      confidence: CONFIDENCE_SMTP_OK,
      reason: role ? "smtp-verified role account" : "smtp-verified",
      status: role ? "risky" : "deliverable",
    };
  }

  return {
    ...withMx,
    confidence: 0,
    reason: `smtp rejected (${realCode ?? "no reply"})`,
    status: "undeliverable",
  };
};
