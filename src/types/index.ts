import type {
  User,
  Sample,
  SubscriptionTier,
  Subscription,
  CreditBalance,
  CreditTransaction,
  Purchase,
  Download,
  Rating,
  Favorite,
  Follow,
  CreatorApplication,
  CreatorPayout,
  AuditLog,
} from "@prisma/client";

// Re-export Prisma types for convenience
export type {
  User,
  Sample,
  SubscriptionTier,
  Subscription,
  CreditBalance,
  CreditTransaction,
  Purchase,
  Download,
  Rating,
  Favorite,
  Follow,
  CreatorApplication,
  CreatorPayout,
  AuditLog,
};

// Extended types with relations
export type UserWithSubscription = User & {
  subscription: (Subscription & { tier: SubscriptionTier }) | null;
  creditBalance: CreditBalance | null;
};

export type SampleWithCreator = Sample & {
  creator: Pick<User, "id" | "username" | "artistName" | "avatarUrl">;
};

export type PurchaseWithSample = Purchase & {
  sample: SampleWithCreator;
};

// API response types
export interface ApiError {
  error: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
