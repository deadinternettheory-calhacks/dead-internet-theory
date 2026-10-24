// Generates throwaway local credentials into private files; never prints tokens.
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
const directory = process.argv[2] ?? "/tmp/dit-local-demo";
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const secret = randomBytes(48).toString("base64url");
const receiver = randomBytes(32).toString("base64url");
async function token(sub: string, role: string, investigations?: string[]) {
  return new SignJWT({ role, ...(investigations ? { investigations } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer("dit-backend")
    .setAudience("dit-v1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}
await fs.writeFile(
  directory + "/backend.env",
  `AUTH_JWT_SECRET=${secret}\nPROVIDER_MODE=fixture\nINFERENCE_EVENT_URL=http://127.0.0.1:4010/events\nINFERENCE_EVENT_TOKEN=${receiver}\nLOCAL_SYNTHETIC_EVENT_DELIVERY=true\n`,
  { mode: 0o600 },
);
await fs.writeFile(
  directory + "/client.env",
  `BACKEND_BASE_URL=http://127.0.0.1:3211\nFRONTEND_API_TOKEN=${await token("local-demo", "frontend")}\nINFERENCE_API_TOKEN=${await token("local-mock", "inference", ["*"])}\nINFERENCE_EVENT_TOKEN=${receiver}\nMOCK_INBOX_DIR=${directory}/inbox\n`,
  { mode: 0o600 },
);
console.log(
  `Wrote private local-demo files: ${directory}/backend.env and ${directory}/client.env (tokens expire in one hour)`,
);
