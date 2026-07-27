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
export function groupModerationByCreator(
  kind: ModerationKind,
  action: ModerationAction,
  items: ModeratedItem[]
): NotificationInput[] {
  const byCreator = new Map<string, ModeratedItem[]>();
  for (const item of items) {
    if (!item.creatorId) continue;
    const list = byCreator.get(item.creatorId);
    if (list) list.push(item);
    else byCreator.set(item.creatorId, [item]);
  }

  const contextType = kind === "sample" ? "Sample" : "Preset";
  const rows: NotificationInput[] = [];
  for (const [creatorId, group] of byCreator) {
    rows.push({
      userId: creatorId,
      type: MODERATION_TYPE[kind][action],
      title: moderationTitle(kind, action, group.length, group[0]?.name),
      contextType,
      contextId: group.length === 1 ? group[0].id : null,
      metadata: {
        count: group.length,
        itemNames: group.slice(0, 5).map((i) => i.name),
        itemIds: group.map((i) => i.id),
      },
    });
  }
  return rows;
}
