// Who an admin broadcast goes to.
//
// Pure resolution (no prisma import) so the audience rules are unit-testable and
// so the send route, the count endpoint, and the UI all agree on one definition
// instead of each rebuilding a where-clause.

import type { Prisma } from "@prisma/client";

export const BROADCAST_AUDIENCES = [
  "ALL",
  "CREATORS",
  "USERS",
  "SPECIFIC",
] as const;

export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

// Hard ceiling on a hand-picked send. Higher than any realistic manual list and
// low enough that the paced email loop still finishes inside maxDuration.
export const MAX_SPECIFIC_RECIPIENTS = 200;

export function isBroadcastAudience(value: unknown): value is BroadcastAudience {
  return (
    typeof value === "string" &&
    (BROADCAST_AUDIENCES as readonly string[]).includes(value)
  );
}

// Suspended accounts are excluded from every audience: isActive:false is the
// suspension flag the middleware enforces, and messaging a suspended account
// would send mail to someone who can't sign in to read it.
export function audienceWhere(
  audience: BroadcastAudience,
  userIds: string[] = []
): Prisma.UserWhereInput {
  switch (audience) {
    case "ALL":
      return { isActive: true };
    case "CREATORS":
      // Role is single-valued, so this deliberately excludes staff who also
      // create — the same rule the original creators-only broadcast used.
      return { role: "CREATOR", isActive: true };
    case "USERS":
      // Plain members only: not creators, not staff.
      return { role: "USER", isActive: true };
    case "SPECIFIC":
      return { id: { in: userIds }, isActive: true };
  }
}

export function audienceLabel(
  audience: BroadcastAudience,
  count: number
): string {
  const plural = count === 1 ? "" : "s";
  switch (audience) {
    case "ALL":
      return `${count} active account${plural}`;
    case "CREATORS":
      return `${count} approved creator${plural}`;
    case "USERS":
      return `${count} non-creator member${plural}`;
    case "SPECIFIC":
      return `${count} selected recipient${plural}`;
  }
}

export type ParsedAudience =
  | { ok: true; audience: BroadcastAudience; userIds: string[] }
  | { ok: false; error: string };

export function parseAudience(
  rawAudience: unknown,
  rawUserIds: unknown
): ParsedAudience {
  // Absent audience means the pre-targeting behaviour: creators only. Keeps
  // any older caller working rather than 400-ing it.
  const audience = rawAudience === undefined ? "CREATORS" : rawAudience;

  if (!isBroadcastAudience(audience)) {
    return { ok: false, error: "Invalid audience" };
  }

  if (audience !== "SPECIFIC") {
    return { ok: true, audience, userIds: [] };
  }

  if (!Array.isArray(rawUserIds)) {
    return { ok: false, error: "userIds required when targeting specific users" };
  }

  const userIds = [
    ...new Set(rawUserIds.filter((id): id is string => typeof id === "string")),
  ];

  if (userIds.length === 0) {
    return { ok: false, error: "Select at least one recipient" };
  }
  if (userIds.length > MAX_SPECIFIC_RECIPIENTS) {
    return {
      ok: false,
      error: `Too many recipients (max ${MAX_SPECIFIC_RECIPIENTS})`,
    };
  }

  return { ok: true, audience, userIds };
}
