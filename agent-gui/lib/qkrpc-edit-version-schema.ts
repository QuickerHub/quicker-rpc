import { z } from "zod";

/** Preserve host CAS tokens; JavaScript numbers may represent only safe integers. */
export const qkrpcEditVersionSchema = z.union([
  z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  z.string().max(20).regex(/^-?\d+$/).refine((value) => {
    if (value.length > 20) return false;
    try {
      const version = BigInt(value);
      return version >= -9223372036854775808n && version <= 9223372036854775807n;
    } catch { return false; }
  }, "Expected a signed Int64 decimal string"),
]).describe("Exact editVersion from the last host response; use a decimal string for integers outside the JavaScript safe range");

export type QkrpcEditVersion = z.infer<typeof qkrpcEditVersionSchema>;
