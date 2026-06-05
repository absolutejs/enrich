import { resolveMx } from "node:dns/promises";

const RANDOM_LOCAL_LENGTH = 16;
const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// Mail exchangers for a domain, lowest priority (most preferred) first. Empty
// when the domain publishes none — i.e. it doesn't accept mail.
export const mxHostsFor = async (domain: string) => {
  const records = await resolveMx(domain).catch(() => []);

  return records
    .filter((record) => record.exchange)
    .sort((left, right) => left.priority - right.priority)
    .map((record) => record.exchange);
};

// A random local-part used to detect catch-all domains (probe it; if the server
// still accepts, the domain accepts everything).
export const randomLocalpart = () => {
  let out = "";
  for (let index = 0; index < RANDOM_LOCAL_LENGTH; index += 1) {
    out += RANDOM_CHARS.charAt(Math.floor(Math.random() * RANDOM_CHARS.length));
  }

  return out;
};
