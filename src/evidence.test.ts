import { expect, test } from "bun:test";
import {
  emailDomainMatchesCompany,
  validatePublicContactEvidence,
} from "./evidence";
test("registered identities retain hyphens and public/private suffix boundaries", () => {
  expect(emailDomainMatchesCompany("a@other.co.uk", "https://acme.co.uk")).toBe(
    false,
  );
  expect(
    emailDomainMatchesCompany("a@acme-company.com", "acmecompany.com"),
  ).toBe(false);
  expect(emailDomainMatchesCompany("a@mail.acme.co.uk", "www.acme.co.uk")).toBe(
    true,
  );
  expect(emailDomainMatchesCompany("a@foo.github.io", "bar.github.io")).toBe(
    false,
  );
  expect(
    emailDomainMatchesCompany("a@parent.com", "brand.com", ["parent.com"]),
  ).toBe(true);
});
test("contact quotation must establish name and address in retrieved source", () => {
  const value = {
    email: "jane@acme.com",
    fullName: "Jane Doe",
    status: "published" as const,
    sourceUrl: "https://acme.com/team",
    quote: "Contact Jane Doe: jane@acme.com",
  };
  expect(
    validatePublicContactEvidence(value, {
      fullName: "Jane Doe",
      sources: [{ url: value.sourceUrl, excerpts: [value.quote] }],
    }),
  ).toBe(true);
  expect(
    validatePublicContactEvidence(
      { ...value, quote: "info@acme.com" },
      { fullName: "Jane Doe", sources: [] },
    ),
  ).toBe(false);
});
