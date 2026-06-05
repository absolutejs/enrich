import { connect } from "node:net";

const SMTP_PORT = 25;
const DEFAULT_STEP_TIMEOUT_MS = 8000;
const SMTP_GREETING = 220;
const SMTP_OK_CLASS = 2;
const REPLY_CODE_LENGTH = 3;

export type SmtpProbeOptions = {
  /** Domain used in EHLO/HELO — should be a real domain you control. */
  heloHost?: string;
  /** MAIL FROM address — a deliverable mailbox on a domain you control. */
  fromEmail?: string;
  /** Per-command timeout in ms (the overall budget scales with address count). */
  timeoutMs?: number;
  port?: number;
};

type Reply = { code: number; text: string };

const replyClass = (code: number) => Math.floor(code / 100);

// Probe one MX host in a single session: greet → EHLO/HELO → MAIL FROM → one
// RCPT TO per address (the connection is reused). Returns the SMTP reply code
// per address (250 = accepted, 550 = no such mailbox, …) in order, or NULL for
// the whole probe when the connection/handshake fails — port 25 blocked (most
// clouds block outbound 25 by default), greylisting, TLS-only, or timeout. A
// null result means "could not verify", never "undeliverable".
export const probeMailbox = (
  mxHost: string,
  addresses: string[],
  options: SmtpProbeOptions = {},
): Promise<(number | null)[] | null> => {
  const stepTimeout = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const heloHost = options.heloHost ?? "mail.absolutejs.com";
  const fromEmail = options.fromEmail ?? `verify@${heloHost}`;
  const port = options.port ?? SMTP_PORT;

  return new Promise((resolve) => {
    const socket = connect({ host: mxHost, port });
    socket.setEncoding("utf8");

    let buffer = "";
    let settled = false;
    const queue: Reply[] = [];
    let waiter: ((reply: Reply) => void) | null = null;

    const finish = (result: (number | null)[] | null) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // already closed
      }
      resolve(result);
    };

    const deliver = (reply: Reply) => {
      if (waiter) {
        const fire = waiter;
        waiter = null;
        fire(reply);

        return;
      }
      queue.push(reply);
    };

    const readReply = () =>
      new Promise<Reply>((res, rej) => {
        const queued = queue.shift();
        if (queued) {
          res(queued);

          return;
        }
        const timer = setTimeout(() => {
          waiter = null;
          rej(new Error("smtp read timeout"));
        }, stepTimeout);
        waiter = (reply) => {
          clearTimeout(timer);
          res(reply);
        };
      });

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      // Drain every COMPLETE reply: a reply ends on a line "NNN<space>…";
      // "NNN-…" lines are continuations and stay buffered until the final line.
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        const isFinal = /^\d{3} /.test(line);
        const isContinuation = /^\d{3}-/.test(line);
        buffer = buffer.slice(newline + 1);
        if (isFinal) {
          deliver({
            code: Number.parseInt(line.slice(0, REPLY_CODE_LENGTH), 10),
            text: line,
          });
        } else if (!isContinuation) {
          // Unexpected non-reply line — ignore it.
        }
      }
    });
    socket.on("error", () => finish(null));
    socket.on("close", () => finish(null));

    const command = async (line: string) => {
      socket.write(`${line}\r\n`);

      return readReply();
    };

    void (async () => {
      try {
        const greeting = await readReply();
        if (greeting.code !== SMTP_GREETING) return finish(null);

        const ehlo = await command(`EHLO ${heloHost}`);
        if (replyClass(ehlo.code) !== SMTP_OK_CLASS) {
          const helo = await command(`HELO ${heloHost}`);
          if (replyClass(helo.code) !== SMTP_OK_CLASS) return finish(null);
        }

        const mailFrom = await command(`MAIL FROM:<${fromEmail}>`);
        if (replyClass(mailFrom.code) !== SMTP_OK_CLASS) return finish(null);

        // RCPT TO must be sequential on the one shared session — recurse instead
        // of an await-in-loop.
        const probeRemaining = async (
          remaining: readonly string[],
          collected: (number | null)[],
        ): Promise<(number | null)[]> => {
          const [head, ...rest] = remaining;
          if (head === undefined) return collected;
          const rcpt = await command(`RCPT TO:<${head}>`);

          return probeRemaining(rest, [...collected, rcpt.code]);
        };
        const codes = await probeRemaining(addresses, []);
        await command("QUIT").catch(() => undefined);

        return finish(codes);
      } catch {
        return finish(null);
      }
    })();
  });
};
