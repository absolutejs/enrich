# @absolutejs/enrich

In-house B2B email **verification** and **discovery** — the engine commercial
enrichment APIs (PDL, Apollo, Hunter, Clearbit) charge per lookup. You bring the
inputs (a name + a company domain); this resolves and verifies the email.

> Licensed under **BSL 1.1** (converts to Apache 2.0 on 2030-06-06). Use it to
> build your own products; you may not host it as a competing enrichment SaaS.
> See `LICENSE`.

## What it does

- **`findEmail({ firstName, lastName | fullName, domain }, { verifier?, knownPattern? })`**
  — generates the corporate patterns (`first.last`, `flast`, …), then:
  1. a **`knownPattern`** (one you've already learned for this domain) is applied
     directly — no probing,
  2. with a **`verifier`** it confirms candidates best-first and returns the one
     that's deliverable,
  3. with neither it returns the top pattern at MX-only confidence.
  The result's **`template`** (e.g. `"first.last"`) is the learnable unit — store
  it per domain and pass it back as `knownPattern` to skip probing for everyone
  else there.
- **`verifyEmail(email)`** — the full local pipeline: syntax → disposable/free/role
  → MX → (optional, opt-in) catch-all + SMTP probe → 0–100 confidence + status.

```ts
import { findEmail } from "@absolutejs/enrich";

// Discovery-only — no SMTP, no third-party call:
await findEmail({ fullName: "Jane Doe", domain: "acme.com" });
// → { email: "jane.doe@acme.com", status: "unknown", confidence: 45, template: "first.last" }

// With a verifier you bring (ZeroBounce / Hunter / your ESP):
await findEmail({ fullName: "Jane Doe", domain: "acme.com" }, { verifier });
// → { email: "jane.doe@acme.com", status: "deliverable", confidence: 95, template: "first.last" }
```

## The verifier is pluggable — and that's the point

The "confirm" step is an interface, not a baked-in SMTP probe:

```ts
type EmailVerifier = (email: string) => Promise<{ status; confidence; catchAll? }>;
```

Bring a thin wrapper over a **specialist** (ZeroBounce, NeverBounce, Hunter's
verifier, or your ESP's validation). Why not just probe SMTP ourselves? Because
`RCPT TO` probing is mechanically a **directory-harvest attack** — mail servers
detect it and **blacklist the probing IP**, which then tanks *your own* sending
reputation. The specialists run it from warmed, rotated IP pools built to absorb
that. Let them carry the risk for pennies a check; keep your domains clean.

## Confidence scale

| score | meaning |
|------|---------|
| 95 | SMTP-confirmed on a non-catch-all domain |
| 60 | catch-all domain — the mailbox can't be individually confirmed |
| 45 | MX exists, SMTP inconclusive (port 25 blocked, greylisted, or `skipSmtp`) |
| 0  | invalid syntax / no MX / SMTP-rejected / disposable |

## The built-in SMTP verifier (`smtpVerifier`) is opt-in — and carries warnings

The package ships `smtpVerifier()` so you *can* self-host the confirm step, but
it's deliberately not the default:

- It needs **outbound port 25**, which AWS/GCP/DigitalOcean **block by default**.
- Even with egress, probing **risks blacklisting your IP** (see above) and the
  biggest mail hosts (Gmail, Microsoft) **return ambiguous answers to defeat
  harvesters** — so its accuracy is degraded where it matters most.

Only reach for it from a host/relay you've dedicated to verification and whose
reputation you're willing to spend. For everyone else: `findEmail` discovers the
pattern (free, zero abuse signature), a specialist verifier confirms it, and you
**store the confirmed `template` per domain** — over time that learned dataset,
built from real outcomes rather than probing, is the moat the paid providers
actually have.

## Public-profile enrichment (`@absolutejs/enrich/profile`)

Keyless avatar/logo derivation from identifiers you already have — no per-lookup
API. Browser-safe subpath (no `node:` imports), so the same module runs in your
backend and your frontend bundle:

- **`personAvatarCandidates({ imageUrl?, email?, twitterUrl?, instagramUrl?, githubUrl? })`**
  — every avatar URL derivable from the person's identifiers, best-first:
  a photo you sourced yourself, then email (Gravatar et al. via
  [unavatar.io](https://unavatar.io)), then X / Instagram / GitHub handles.
  Use it to offer a *choice* of avatars.
- **`personAvatarUrl(person)`** — the first (most trusted) candidate, or `null`.
  unavatar URLs carry `fallback=false`, so they 404 when nothing is found and an
  `<img onerror>` can drop to initials. Loading from the client keeps the
  identifier off your server's egress.
- **`validatedAvatarUrl(person, timeoutMs?)`** — server-side: the first candidate
  that HEAD-validates as a real image, for when you persist the result.
- **`validateImageUrl(url, timeoutMs?)`** — HEAD-check any image URL.
- **`companyLogoUrl(website, sizePx?)`** — company logo via Google's keyless
  favicon service (Clearbit's logo API is sunset; DuckDuckGo has gaps).
- **`socialUrlsFromLinks(links)`** — sort a loose `{ url, platform? }[]` link
  list (an LLM's "notable links", a scraped profile) into canonical per-platform
  URL fields, matching the declared platform first and the URL host second.
- **`socialHandle(url, hosts)`** — extract a clean handle from a profile URL.
