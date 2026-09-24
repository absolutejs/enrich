import { getDomain } from "tldts";
export const domainFromUrl = (value: string | null | undefined) => {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(
      value.includes("://") ? value.trim() : `https://${value.trim()}`,
    );
    return /^https?:$/u.test(url.protocol) && !url.username && !url.password
      ? url.hostname.toLowerCase().replace(/^www\./u, "")
      : undefined;
  } catch {
    return undefined;
  }
};
export const registrableDomain = (value: string | null | undefined) => {
  const host = domainFromUrl(value);
  return host
    ? (getDomain(host, { allowPrivateDomains: true }) ?? undefined)
    : undefined;
};
/** Aliases must be approved by the host using independent evidence. Never remove hyphens. */
export const emailDomainMatchesCompany = (
  email: string | null | undefined,
  website: string | null | undefined,
  verifiedAliases: string[] = [],
) => {
  if (!email || !/^[^\s@]+@[^\s@]+$/u.test(email)) return false;
  const emailDomain = registrableDomain(email.split("@")[1]);
  return Boolean(
    emailDomain &&
    [website, ...verifiedAliases].some(
      (domain) => registrableDomain(domain) === emailDomain,
    ),
  );
};
export type PublicContactEvidence = {
  email: string;
  sourceUrl: string;
  quote: string;
  fullName: string;
  status: "published";
};
/** Validates provenance/identity text, not mailbox deliverability or semantic ownership. */
export const validatePublicContactEvidence = (
  value: PublicContactEvidence,
  input: { fullName: string; sources: { url: string; excerpts: string[] }[] },
) => {
  const normalize = (text: string) =>
    text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  if (
    value.status !== "published" ||
    normalize(value.fullName) !== normalize(input.fullName) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.email)
  )
    return false;
  const source = input.sources.find((source) => source.url === value.sourceUrl);
  const quote = normalize(value.quote);
  return Boolean(
    source &&
    quote.includes(normalize(input.fullName)) &&
    quote.includes(normalize(value.email)) &&
    source.excerpts.some((text) => normalize(text).includes(quote)),
  );
};
