export {
  isDisposableDomain,
  isFreeProvider,
  isRoleLocalpart,
} from "./classify";
export {
  findEmail,
  type FindEmailInput,
  type FindEmailOptions,
  type FindEmailResult,
} from "./findEmail";
export {
  emailPatterns,
  parseName,
  type NameInput,
  type NameParts,
} from "./patterns";
export { probeMailbox, type SmtpProbeOptions } from "./smtp";
export {
  verifyEmail,
  type EmailStatus,
  type VerifyOptions,
  type VerifyResult,
} from "./verify";
