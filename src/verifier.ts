import { verifyEmail, type EmailStatus, type VerifyOptions } from "./verify";

export type VerifierResult = {
  status: EmailStatus;
  confidence: number;
  catchAll?: boolean;
};

// The "confirm" step, pluggable. Bring your own — a thin async wrapper over
// ZeroBounce / NeverBounce / Hunter's verifier / your ESP's validation — so the
// risky part (live SMTP / IP reputation) runs on infrastructure built to absorb
// it, not yours. `findEmail` calls this per candidate, best-first.
export type EmailVerifier = (email: string) => Promise<VerifierResult>;

// Built-in SMTP verifier — OPT-IN, and deliberately not the default. It performs
// `RCPT TO` probing, which is the same technique as a directory-harvest attack:
// it needs outbound port 25 (blocked on most clouds) AND risks the probing IP's
// mail reputation. Only use it from a host/relay you've dedicated to this and
// accept the trade-off. In production prefer a specialist verifier (above).
export const smtpVerifier =
  (options: VerifyOptions = {}): EmailVerifier =>
  async (email) => {
    const result = await verifyEmail(email, options);

    return {
      catchAll: result.catchAll,
      confidence: result.confidence,
      status: result.status,
    };
  };
