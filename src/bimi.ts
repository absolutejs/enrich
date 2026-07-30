import { resolveTxt } from "node:dns/promises";

// BIMI (Brand Indicators for Message Identification): a domain publishes its
// verified brand logo as a DNS TXT record at `<selector>._bimi.<domain>` —
// the mechanism Gmail/Apple Mail/Yahoo use to render brand avatars next to
// messages. The `l=` tag is the logo URL (an SVG, https required by the
// spec); an empty `l=` means the domain explicitly declines a logo.

/** The logo URL from one BIMI TXT record, or null when the record isn't a
 *  valid BIMI assertion (wrong version, empty/insecure `l=`). */
export const parseBimiRecord = (record: string) => {
  const trimmed = record.trim();
  if (!/^v=bimi1\s*(?:;|$)/i.test(trimmed)) return null;
  const url = /(?:^|;)\s*l=([^;]*)/i.exec(trimmed)?.[1]?.trim() ?? "";

  return url.startsWith("https://") ? url : null;
};

/** The domain's published BIMI brand-logo URL (SVG), or null when the domain
 *  doesn't assert one. DNS failures are treated as "no logo", never thrown. */
export const bimiLogoUrl = async (domain: string, selector = "default") => {
  const host = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return null;
  const records = await resolveTxt(`${selector}._bimi.${host}`).catch(
    () => [],
  );
  for (const chunks of records) {
    const url = parseBimiRecord(chunks.join(""));
    if (url) return url;
  }

  return null;
};
