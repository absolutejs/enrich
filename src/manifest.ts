import { defineManifest, toolFactory } from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";
import { findEmail, type FindEmailOptions } from "./findEmail";
import { verifyEmail, type VerifyOptions } from "./verify";

/* Composite runtime (v1 convention): the tools need the host's wired
 * FindEmailOptions (the pluggable verifier + learned patterns) and its
 * VerifyOptions (SMTP posture). */
type EnrichRuntime = {
  findOptions: FindEmailOptions;
  verifyOptions: VerifyOptions;
};

const tool = toolFactory<EnrichRuntime>();

const SMTP_PORT = 25;
const MAX_PORT = 65535;

/* Serializable subset of VerifyOptions (skipSmtp + SMTP probe knobs). The
 * confirm-step `verifier` and per-domain `knownPattern` are wiring concerns. */
export const manifest = defineManifest<VerifyOptions, EnrichRuntime>()({
  contract: 2,
  identity: {
    accent: "#10b981",
    category: "growth",
    description:
      "In-house B2B email verification and discovery — the engine commercial enrichment APIs charge per lookup. `findEmail` generates corporate patterns (first.last, flast, …) and returns the learnable template per domain; `verifyEmail` runs syntax → disposable/free/role → MX → optional SMTP. The confirm step is a pluggable verifier interface: bring a specialist (ZeroBounce, NeverBounce, your ESP) instead of probing from your own IPs. Keyless avatar/logo enrichment ships on the browser-safe `/profile` subpath.",
    docsUrl: "https://github.com/absolutejs/enrich",
    name: "@absolutejs/enrich",
    tagline: "Find and verify work email addresses without paid lookups.",
  },
  settings: Type.Object({
    fromEmail: Type.Optional(
      Type.String({
        description:
          "MAIL FROM address used by the SMTP probe — a deliverable mailbox on a domain you control.",
        format: "email",
        title: "Probe sender",
        "x-group": "smtp",
      }),
    ),
    heloHost: Type.Optional(
      Type.String({
        description:
          "Domain announced in EHLO/HELO during the SMTP probe — should be a real domain you control.",
        title: "Probe HELO domain",
        "x-group": "smtp",
      }),
    ),
    port: Type.Optional(
      Type.Integer({
        default: SMTP_PORT,
        description: "SMTP port for the probe. Most clouds block outbound 25.",
        maximum: MAX_PORT,
        minimum: 1,
        title: "Probe port",
        "x-group": "smtp",
      }),
    ),
    skipSmtp: Type.Optional(
      Type.Boolean({
        default: true,
        description:
          "Skip the direct SMTP probe (results top out at MX-only confidence). Keep on unless you run a dedicated verification host — probing from your own IP risks blacklisting and most clouds block port 25 anyway.",
        title: "Skip SMTP probing",
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Integer({
        description: "Per-command SMTP timeout in milliseconds.",
        minimum: 100,
        title: "Probe timeout",
        "x-group": "smtp",
      }),
    ),
  }),
  tools: {
    find_email: tool.runtime({
      annotations: { idempotentHint: true, openWorldHint: true },
      authorization: {
        approval: "never",
        audience: "authenticated",
        destinations: ["configured-enrichment-provider"],
        effects: ["read", "external-network"],
        idempotency: { mode: "host" },
        requiredScopes: ["contacts:enrich"],
        reversible: false,
      },
      description:
        "Find the most likely work email for a person at a company domain. Returns the email, deliverability status, 0–100 confidence, and the pattern template (store it per domain to skip probing next time). Free-provider domains return nothing.",
      handler: async ({ domain, firstName, fullName, lastName }, runtime) => {
        const result = await findEmail(
          { domain, firstName, fullName, lastName },
          runtime.findOptions,
        );

        return result === null
          ? "no candidate — missing name, bare domain, or a free email provider"
          : JSON.stringify(result);
      },
      input: Type.Object({
        domain: Type.String({
          description: "Company domain or website URL.",
          examples: ["acme.com"],
          minLength: 1,
        }),
        firstName: Type.Optional(Type.String()),
        fullName: Type.Optional(
          Type.String({ description: "Alternative to first/last name." }),
        ),
        lastName: Type.Optional(Type.String()),
      }),
    }),
    verify_email: tool.runtime({
      annotations: { idempotentHint: true, openWorldHint: true },
      authorization: {
        approval: "policy",
        audience: "authenticated",
        destinations: ["configured-email-verification-provider"],
        effects: ["read", "external-network"],
        idempotency: { mode: "host" },
        requiredScopes: ["contacts:enrich"],
        reversible: false,
      },
      description:
        "Verify one email address: syntax, disposable/free/role heuristics, MX lookup, and (only if the host enabled it) an SMTP probe. Returns status and 0–100 confidence; never reports a false 'undeliverable' when SMTP is unreachable.",
      handler: async ({ email }, runtime) =>
        JSON.stringify(await verifyEmail(email, runtime.verifyOptions)),
      input: Type.Object({
        email: Type.String({ format: "email" }),
      }),
    }),
  },
  wiring: [
    {
      description:
        "Discovery is free and abuse-signature-free; confirm candidates through a pluggable verifier you bring, and store each confirmed pattern per domain.",
      id: "default",
      server: {
        code: [
          "const enrichVerifyOptions: VerifyOptions = ${settings};",
          "",
          "const enrichFindOptions: FindEmailOptions = {",
          "\t// TODO: bring a specialist verifier (ZeroBounce, NeverBounce, your",
          "\t// ESP) to confirm candidates — probing SMTP from your own IPs looks",
          "\t// like a directory-harvest attack and gets them blacklisted.",
          "\t// verifier: async (email) => yourVerifierApi(email)",
          "};",
          "",
          "// const found = await findEmail(",
          "// \t{ domain: 'acme.com', fullName: 'Jane Doe' },",
          "// \tenrichFindOptions",
          "// );",
          "// Store found.template per domain and pass it back as knownPattern.",
        ].join("\n"),
        imports: [
          {
            from: "@absolutejs/enrich",
            names: ["FindEmailOptions", "VerifyOptions"],
            typeOnly: true,
          },
        ],
        placement: "module-scope",
      },
      title: "Set the verification posture",
    },
  ],
});
