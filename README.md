# @absolutejs/enrich

In-house B2B email **verification** and **discovery** — the engine commercial
enrichment APIs (PDL, Apollo, Hunter, Clearbit) charge per lookup. You bring the
inputs (a name + a company domain); this resolves and verifies the email.

> Licensed under **BSL 1.1** (converts to Apache 2.0 on 2030-06-06). Use it to
> build your own products; you may not host it as a competing enrichment SaaS.
> See `LICENSE`.

## What it does

- **`verifyEmail(email)`** — syntax → disposable/free/role heuristics → MX →
  catch-all probe → SMTP `RCPT TO` → a 0–100 confidence + status
  (`deliverable` / `risky` / `undeliverable` / `unknown`).
- **`findEmail({ firstName, lastName | fullName, domain })`** — generates the
  ~12 corporate patterns and resolves them on the company's mail server, returning
  the SMTP-confirmed address (or the best pattern at lower confidence). The
  returned `pattern` can be reused to guess other people at the same company
  without re-probing.

```ts
import { findEmail, verifyEmail } from "@absolutejs/enrich";

await findEmail({ fullName: "Jane Doe", domain: "acme.com" });
// → { email: "jane.doe@acme.com", status: "deliverable", confidence: 95, pattern: "first.last", catchAll: false }

await verifyEmail("jane.doe@acme.com");
// → { status: "deliverable", confidence: 95, mxFound: true, catchAll: false, ... }
```

## Confidence scale

| score | meaning |
|------|---------|
| 95 | SMTP-confirmed on a non-catch-all domain |
| 60 | catch-all domain — the mailbox can't be individually confirmed |
| 45 | MX exists, SMTP inconclusive (port 25 blocked, greylisted, or `skipSmtp`) |
| 0  | invalid syntax / no MX / SMTP-rejected / disposable |

## The one piece of infrastructure: outbound port 25

SMTP verification opens a connection to the target's mail server on **port 25**.
Most clouds (AWS, GCP, DigitalOcean) **block outbound port 25 by default** to fight
spam. Without it, every probe degrades gracefully to **MX-only confidence (45)** —
the library still validates the domain and returns the best-guess pattern, just
not SMTP-confirmed. To unlock the 95-confidence path:

- Request a port-25 unblock from your provider (DigitalOcean grants these on
  request), **or**
- Run probes through a small relay / proxy box that has port 25 egress, **or**
- Pass `skipSmtp: true` to stay MX-only deliberately.

Use a real `heloHost` / `fromEmail` you control (`SmtpProbeOptions`) so receiving
servers treat the probe as legitimate. The library is the engine; the egress IP
reputation is yours to own — that, plus an aggregated dataset, is the only moat
the paid providers actually have.
