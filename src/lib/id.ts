import { nanoid } from "nanoid";

/**
 * Generate a unique ID with an optional type prefix.
 * Pattern: <prefix>_<12 random chars>
 * Examples: char_abc123xyz456, skel_def456uvw789
 */
export function generateId(prefix?: string): string {
  return prefix ? `${prefix}_${nanoid(12)}` : nanoid(12);
}
