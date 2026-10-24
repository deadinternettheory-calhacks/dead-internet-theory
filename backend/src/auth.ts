import { jwtVerify } from "jose";
import { ApiFault } from "./core";
export interface Principal {
  sub: string;
  role: "frontend" | "inference";
  investigations: string[];
}
export async function authenticate(header: string | null): Promise<Principal> {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiFault(
      500,
      "INTERNAL_ERROR",
      "Authentication is not configured",
    );
  if (!header?.startsWith("Bearer "))
    throw new ApiFault(401, "UNAUTHORIZED", "Bearer authentication required");
  try {
    const { payload } = await jwtVerify(
      header.slice(7),
      new TextEncoder().encode(secret),
      {
        algorithms: ["HS256"],
        issuer: "dit-backend",
        audience: "dit-v1",
        requiredClaims: ["exp", "sub", "role"],
        maxTokenAge: "1h",
      },
    );
    if (
      !payload.sub ||
      !["frontend", "inference"].includes(String(payload.role))
    )
      throw Error();
    const scopes = payload.investigations;
    if (
      scopes !== undefined &&
      (!Array.isArray(scopes) || !scopes.every((s) => typeof s === "string"))
    )
      throw Error();
    return {
      sub: payload.sub,
      role: payload.role as Principal["role"],
      investigations: (scopes ?? []) as string[],
    };
  } catch {
    throw new ApiFault(401, "UNAUTHORIZED", "Invalid or expired bearer token");
  }
}
export function authorize(p: Principal, owner: string, id: string) {
  if (p.role === "frontend" && p.sub === owner) return;
  if (
    p.role === "inference" &&
    (p.investigations.includes("*") || p.investigations.includes(id))
  )
    return;
  throw new ApiFault(403, "FORBIDDEN", "Investigation access denied");
}
