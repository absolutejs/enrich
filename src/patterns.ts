// ASCII-fold + strip everything that can't appear in a corporate local-part.
const clean = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export type NameParts = { first: string; last?: string };

export type NameInput = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

// Named local-part shapes. The NAME (not the concrete address) is what the
// learning loop stores per domain: once we know acme.com is "first.last", we
// apply it to everyone else there without re-probing.
export type PatternTemplate =
  | "first.last"
  | "firstlast"
  | "flast"
  | "first"
  | "first_last"
  | "f.last"
  | "first-last"
  | "last.first"
  | "lastf"
  | "last"
  | "firstl"
  | "fl";

// Likelihood order, best-first (rough real-world frequency).
const TEMPLATE_ORDER: PatternTemplate[] = [
  "first.last",
  "firstlast",
  "flast",
  "first",
  "first_last",
  "f.last",
  "first-last",
  "last.first",
  "lastf",
  "last",
  "firstl",
  "fl",
];

const buildLocal = (
  template: PatternTemplate,
  { first, last }: NameParts,
): string | null => {
  const fi = first.charAt(0);
  const li = last?.charAt(0) ?? "";
  switch (template) {
    case "first":
      return first;
    case "last":
      return last ?? null;
    case "first.last":
      return last ? `${first}.${last}` : null;
    case "firstlast":
      return last ? `${first}${last}` : null;
    case "flast":
      return last ? `${fi}${last}` : null;
    case "first_last":
      return last ? `${first}_${last}` : null;
    case "f.last":
      return last ? `${fi}.${last}` : null;
    case "first-last":
      return last ? `${first}-${last}` : null;
    case "last.first":
      return last ? `${last}.${first}` : null;
    case "lastf":
      return last ? `${last}${fi}` : null;
    case "firstl":
      return last ? `${first}${li}` : null;
    case "fl":
      return last ? `${fi}${li}` : null;
    default:
      return null;
  }
};

// Resolve {first,last} from explicit fields or a full name. Null when there
// isn't even a first name to work with.
export const parseName = (input: NameInput): NameParts | null => {
  const explicitFirst = input.firstName?.trim();
  if (explicitFirst) {
    const first = clean(explicitFirst);
    const last = input.lastName?.trim() ? clean(input.lastName) : undefined;

    return first ? { first, last: last || undefined } : null;
  }
  const parts = (input.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = clean(parts[0] ?? "");
  if (!first) return null;
  const last = parts.length > 1 ? clean(parts[parts.length - 1] ?? "") : undefined;

  return { first, last: last || undefined };
};

// Build a concrete address from a known template + a name. Null when the
// template needs a last name we don't have.
export const applyTemplate = (
  template: PatternTemplate,
  name: NameParts,
  domain: string,
): string | null => {
  const local = buildLocal(template, name);

  return local ? `${local}@${domain}` : null;
};

export type TemplatedCandidate = { template: PatternTemplate; email: string };

// All candidate addresses (template + email), best-first, deduped.
export const templatedCandidates = (
  name: NameParts,
  domain: string,
): TemplatedCandidate[] => {
  const seen = new Set<string>();
  const out: TemplatedCandidate[] = [];
  for (const template of TEMPLATE_ORDER) {
    const local = buildLocal(template, name);
    if (!local || seen.has(local)) continue;
    seen.add(local);
    out.push({ email: `${local}@${domain}`, template });
  }

  return out;
};

// Just the candidate emails, best-first (kept for the simple call site).
export const emailPatterns = (name: NameParts, domain: string) =>
  templatedCandidates(name, domain).map((candidate) => candidate.email);
