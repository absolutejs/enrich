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

// Resolve {first,last} from explicit fields or a full name. Returns null when
// there isn't even a first name to work with.
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

// Candidate emails in rough real-world likelihood order. With a last name we
// emit the full corporate pattern set; first-name-only collapses to the handful
// that make sense. Deduped, lower-cased.
export const emailPatterns = (name: NameParts, domain: string): string[] => {
  const { first, last } = name;
  const fi = first.charAt(0);
  const li = last?.charAt(0) ?? "";
  const locals = last
    ? [
        `${first}.${last}`,
        `${first}${last}`,
        `${fi}${last}`,
        first,
        `${first}_${last}`,
        `${fi}.${last}`,
        `${first}-${last}`,
        `${last}.${first}`,
        `${last}${fi}`,
        `${last}`,
        `${first}${li}`,
        `${fi}${li}`,
      ]
    : [first];

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const local of locals) {
    if (!local || seen.has(local)) continue;
    seen.add(local);
    emails.push(`${local}@${domain}`);
  }

  return emails;
};
