import { describe, expect, test } from "bun:test";
import { parseBimiRecord } from "./bimi";

describe("parseBimiRecord", () => {
  test("extracts the logo URL from a standard record", () => {
    expect(
      parseBimiRecord(
        "v=BIMI1; l=https://cdn.example.com/logo.svg; a=https://cdn.example.com/vmc.pem",
      ),
    ).toBe("https://cdn.example.com/logo.svg");
  });

  test("tolerates missing spaces between tags", () => {
    expect(parseBimiRecord("v=BIMI1;l=https://x.com/l.svg;a=")).toBe(
      "https://x.com/l.svg",
    );
  });

  test("rejects a record without the BIMI1 version tag", () => {
    expect(parseBimiRecord("v=spf1 include:_spf.example.com ~all")).toBeNull();
  });

  test("rejects a declined logo (empty l=)", () => {
    expect(parseBimiRecord("v=BIMI1; l=;")).toBeNull();
  });

  test("rejects a non-https logo URL", () => {
    expect(parseBimiRecord("v=BIMI1; l=http://x.com/l.svg")).toBeNull();
  });
});
