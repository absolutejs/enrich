import { describe, expect, test } from "bun:test";
import {
  companyLogoUrl,
  personAvatarUrl,
  socialHandle,
  socialUrlsFromLinks,
} from "./profile";

describe("companyLogoUrl", () => {
  test("builds a favicon URL from a bare domain", () => {
    expect(companyLogoUrl("acme.com")).toBe(
      "https://www.google.com/s2/favicons?domain=acme.com&sz=128",
    );
  });

  test("strips protocol, www and path", () => {
    expect(companyLogoUrl("https://www.acme.com/about")).toBe(
      "https://www.google.com/s2/favicons?domain=acme.com&sz=128",
    );
  });

  test("honors a custom size", () => {
    expect(companyLogoUrl("acme.com", 64)).toBe(
      "https://www.google.com/s2/favicons?domain=acme.com&sz=64",
    );
  });

  test("returns null for missing input", () => {
    expect(companyLogoUrl(null)).toBeNull();
    expect(companyLogoUrl("")).toBeNull();
  });
});

describe("socialHandle", () => {
  test("extracts the handle from a profile URL", () => {
    expect(socialHandle("https://twitter.com/jane", ["twitter.com"])).toBe(
      "jane",
    );
    expect(socialHandle("x.com/jane", ["twitter.com", "x.com"])).toBe("jane");
  });

  test("rejects other hosts and non-handle segments", () => {
    expect(socialHandle("https://example.com/jane", ["twitter.com"])).toBeNull();
    expect(
      socialHandle("https://twitter.com/giuseppecrinò", ["twitter.com"]),
    ).toBeNull();
  });
});

describe("socialUrlsFromLinks", () => {
  test("sorts links into platform fields by declared platform", () => {
    const urls = socialUrlsFromLinks([
      { platform: "youtube", url: "https://www.youtube.com/@t3dotgg" },
      { platform: "twitter", url: "https://twitter.com/t3dotgg" },
      { platform: "github", url: "https://github.com/t3dotgg" },
    ]);
    expect(urls.twitterUrl).toBe("https://twitter.com/t3dotgg");
    expect(urls.githubUrl).toBe("https://github.com/t3dotgg");
    expect(urls.instagramUrl).toBeUndefined();
  });

  test("falls back to the URL host when the platform label is wrong", () => {
    const urls = socialUrlsFromLinks([
      { platform: "website", url: "https://x.com/annbordetsky" },
    ]);
    expect(urls.twitterUrl).toBe("https://x.com/annbordetsky");
  });

  test("handles missing input", () => {
    expect(socialUrlsFromLinks(undefined)).toEqual({
      githubUrl: undefined,
      instagramUrl: undefined,
      twitterUrl: undefined,
    });
  });
});

describe("personAvatarUrl", () => {
  test("a sourced photo always wins", () => {
    expect(
      personAvatarUrl({
        email: "jane@acme.com",
        imageUrl: "https://cdn.example.com/jane.jpg",
      }),
    ).toBe("https://cdn.example.com/jane.jpg");
  });

  test("email beats social handles", () => {
    expect(
      personAvatarUrl({
        email: "jane@acme.com",
        twitterUrl: "https://twitter.com/jane",
      }),
    ).toBe("https://unavatar.io/jane%40acme.com?fallback=false");
  });

  test("falls through twitter → instagram → github", () => {
    expect(personAvatarUrl({ twitterUrl: "https://x.com/jane" })).toBe(
      "https://unavatar.io/x/jane?fallback=false",
    );
    expect(
      personAvatarUrl({ instagramUrl: "https://instagram.com/jane" }),
    ).toBe("https://unavatar.io/instagram/jane?fallback=false");
    expect(personAvatarUrl({ githubUrl: "https://github.com/jane" })).toBe(
      "https://unavatar.io/github/jane?fallback=false",
    );
  });

  test("returns null when there is nothing to key on", () => {
    expect(personAvatarUrl({})).toBeNull();
    expect(personAvatarUrl({ email: "not-an-email" })).toBeNull();
  });
});
