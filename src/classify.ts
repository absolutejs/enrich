// Throwaway-mailbox domains — a deliverable address here is worthless for B2B.
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "getnada.com",
  "guerrillamail.com",
  "mailinator.com",
  "maildrop.cc",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
]);

// Consumer mailbox providers. These verify as "everyone exists" at the SMTP
// layer (and aren't a company address), so they're treated as risky for B2B.
const FREE_PROVIDERS = new Set([
  "aol.com",
  "gmail.com",
  "gmx.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yandex.com",
  "zoho.com",
]);

// Shared inboxes, not a specific person. NOTE: "partnerships"/"partners"/"bd"
// are intentionally absent — those ARE useful outreach targets for us.
const ROLE_LOCALPARTS = new Set([
  "abuse",
  "admin",
  "billing",
  "careers",
  "contact",
  "help",
  "hello",
  "hr",
  "info",
  "jobs",
  "legal",
  "marketing",
  "media",
  "noreply",
  "no-reply",
  "office",
  "postmaster",
  "press",
  "sales",
  "support",
  "team",
  "webmaster",
]);

export const isDisposableDomain = (domain: string) =>
  DISPOSABLE_DOMAINS.has(domain.toLowerCase());

export const isFreeProvider = (domain: string) =>
  FREE_PROVIDERS.has(domain.toLowerCase());

export const isRoleLocalpart = (localpart: string) =>
  ROLE_LOCALPARTS.has(localpart.toLowerCase());
