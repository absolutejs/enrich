// Keyless public-profile enrichment: derive avatar/logo URLs from identifiers
// you already have (an email, social profile URLs, a website domain) instead of
// paying a per-lookup enrichment API. Photos resolve through unavatar.io (an
// aggregator over Gravatar + social platforms + favicons); company logos
// through Google's favicon service. Both 404 cleanly for unknown identifiers,
// so a client <img onerror> can fall back to initials.

const UNAVATAR = "https://unavatar.io";
const DEFAULT_LOGO_SIZE_PX = 128;
const DEFAULT_VALIDATE_TIMEOUT_MS = 4000;

// Company logo from the website domain via Google's keyless favicon service.
// (Clearbit's logo API was sunset; DuckDuckGo's ip3 has real gaps even for
// valid domains.) Google has the broadest coverage and returns a clean 404 for
// unknown domains. Accuracy depends on the domain being correct.
export const companyLogoUrl = (
  website: string | null | undefined,
  sizePx: number = DEFAULT_LOGO_SIZE_PX,
) => {
  if (!website) return null;
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    const host = url.hostname.replace(/^www\./, "");

    return host
      ? `https://www.google.com/s2/favicons?domain=${host}&sz=${sizePx}`
      : null;
  } catch {
    return null;
  }
};

// Pull a clean handle out of a social profile URL (e.g. twitter.com/jane →
// jane). Returns null when the URL isn't on one of the given hosts or the
// first path segment doesn't look like a handle.
export const socialHandle = (
  url: string | null | undefined,
  hosts: string[],
) => {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!hosts.includes(host)) return null;
    const [segment] = parsed.pathname.split("/").filter(Boolean);

    return segment && /^[A-Za-z0-9_.]{1,40}$/.test(segment) ? segment : null;
  } catch {
    return null;
  }
};

// A person's presence on one platform — however you sourced it (an LLM's
// "notable links", a scraped profile, user input). `platform` is trusted when
// present; the URL host is the fallback signal.
export type ProfileLink = {
  url: string;
  platform?: string;
};

const matchingLink = (
  links: ProfileLink[] | undefined,
  platforms: string[],
  hosts: string[],
) =>
  links?.find((link) => {
    if (link.platform && platforms.includes(link.platform.toLowerCase())) {
      return true;
    }
    try {
      const host = new URL(link.url).hostname.replace(/^www\./, "");

      return hosts.includes(host);
    } catch {
      return false;
    }
  })?.url;

// Sort a loose link list into the canonical per-platform URL fields that
// `personAvatarUrl` reads. Matches on the link's declared platform first, then
// on the URL host (sources often label a social link "website").
export const socialUrlsFromLinks = (links: ProfileLink[] | undefined) => ({
  githubUrl: matchingLink(links, ["github"], ["github.com"]),
  instagramUrl: matchingLink(links, ["instagram"], ["instagram.com"]),
  twitterUrl: matchingLink(links, ["twitter", "x"], ["twitter.com", "x.com"]),
});

export type PersonAvatarInput = {
  // A real hosted photo you already have — always wins.
  imageUrl?: string | null;
  email?: string | null;
  twitterUrl?: string | null;
  instagramUrl?: string | null;
  githubUrl?: string | null;
};

// Best-effort avatar URL for a person, parallel to companyLogoUrl. A photo you
// already sourced wins; otherwise hand an identifier to unavatar and let the
// client load it. `fallback=false` makes unavatar 404 when it finds nothing,
// so the client can drop to initials. When the CLIENT makes the call, your
// server never ships the identifier to unavatar.
export const personAvatarUrl = (person: PersonAvatarInput) => {
  if (person.imageUrl) return person.imageUrl;
  const email = person.email?.trim();
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return `${UNAVATAR}/${encodeURIComponent(email)}?fallback=false`;
  }
  const twitter = socialHandle(person.twitterUrl, ["twitter.com", "x.com"]);
  if (twitter) return `${UNAVATAR}/x/${twitter}?fallback=false`;
  const instagram = socialHandle(person.instagramUrl, ["instagram.com"]);
  if (instagram) return `${UNAVATAR}/instagram/${instagram}?fallback=false`;
  const github = socialHandle(person.githubUrl, ["github.com"]);
  if (github) return `${UNAVATAR}/github/${github}?fallback=false`;

  return null;
};

// HEAD-validate the avatar URL server-side so you only persist a URL that
// actually resolves to a real image — for when you cache the result instead of
// letting the client's onerror handle misses.
export const validatedAvatarUrl = async (
  person: PersonAvatarInput,
  timeoutMs: number = DEFAULT_VALIDATE_TIMEOUT_MS,
) => {
  const url = personAvatarUrl(person);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    return response.ok ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
