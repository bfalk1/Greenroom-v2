// Pure notification formatting/grouping — no runtime deps so it can be unit
// tested without pulling in prisma or the email stack.

import type { Prisma, NotificationType } from "@prisma/client";

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  metadata?: Prisma.InputJsonValue;
  broadcastId?: string | null;
}

export type ModerationKind = "sample" | "preset";
export type ModerationAction = "approved" | "rejected" | "removed";

export interface ModeratedItem {
  id: string;
  name: string;
  creatorId: string;
}

export const MODERATION_TYPE: Record<
  ModerationKind,
  Record<ModerationAction, NotificationType>
> = {
  sample: {
    approved: "SAMPLE_APPROVED",
    rejected: "SAMPLE_REJECTED",
    removed: "SAMPLE_REMOVED",
  },
  preset: {
    approved: "PRESET_APPROVED",
    rejected: "PRESET_REJECTED",
    removed: "PRESET_REMOVED",
  },
};

const ACTION_PHRASE: Record<ModerationAction, string> = {
  approved: "approved",
  rejected: "not approved",
  removed: "removed",
};

// A moderator's reason is required to reject and optional to remove — an
// approval never carries one. Kept here (not in the routes) so every entry
// point applies the same rule.
export const REVIEW_NOTE_MAX = 1000;
export const REASON_REQUIRED_FOR: ReadonlySet<ModerationAction> = new Set([
  "rejected",
]);

export type ReviewNoteResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

export function parseReviewNote(
  action: ModerationAction,
  raw: unknown
): ReviewNoteResult {
  const note = typeof raw === "string" ? raw.trim() : "";

  if (!note) {
    if (REASON_REQUIRED_FOR.has(action)) {
      return { ok: false, error: "A reason is required when rejecting" };
    }
    return { ok: true, note: null };
  }
  if (note.length > REVIEW_NOTE_MAX) {
    return {
      ok: false,
      error: `Reason must be ${REVIEW_NOTE_MAX} characters or fewer`,
    };
  }
  return { ok: true, note };
}

export function moderationTitle(
  kind: ModerationKind,
  action: ModerationAction,
  count: number,
  firstName?: string
): string {
  const phrase = ACTION_PHRASE[action];
  if (count === 1) {
    return firstName
      ? `Your ${kind} "${firstName}" was ${phrase}`
      : `Your ${kind} was ${phrase}`;
  }
  return `${count} of your ${kind}s were ${phrase}`;
}

// Fold a moderated batch into one notification row per creator, so
// bulk-approving 20 samples for one creator yields a single row.
//
// `reviewNote` is the moderator's reason for the whole call (one decision, one
// reason — a bulk reject shares it across the batch). It lands in the
// notification body so the creator reads "why" without opening anything, and is
// mirrored into metadata for anything that wants it structured.
export function groupModerationByCreator(
  kind: ModerationKind,
  action: ModerationAction,
  items: ModeratedItem[],
  reviewNote?: string | null
): NotificationInput[] {
  const byCreator = new Map<string, ModeratedItem[]>();
  for (const item of items) {
    if (!item.creatorId) continue;
    const list = byCreator.get(item.creatorId);
    if (list) list.push(item);
    else byCreator.set(item.creatorId, [item]);
  }

  const note = reviewNote?.trim() || null;
  const contextType = kind === "sample" ? "Sample" : "Preset";
  const rows: NotificationInput[] = [];
  for (const [creatorId, group] of byCreator) {
    rows.push({
      userId: creatorId,
      type: MODERATION_TYPE[kind][action],
      title: moderationTitle(kind, action, group.length, group[0]?.name),
      body: note,
      contextType,
      contextId: group.length === 1 ? group[0].id : null,
      metadata: {
        count: group.length,
        itemNames: group.slice(0, 5).map((i) => i.name),
        itemIds: group.map((i) => i.id),
        ...(note ? { reviewNote: note } : {}),
      },
    });
  }
  return rows;
}
