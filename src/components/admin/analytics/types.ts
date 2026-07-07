// Shared types for the admin analytics Overview — mirrors the response shape
// of GET /api/admin/analytics.

export type RangeKey = "7d" | "30d" | "90d" | "all";
export type Bucket = "day" | "week" | "month";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface KpiMetric {
  current: number | null;
  previous: number | null;
  series: SeriesPoint[];
}

export interface AnalyticsResponse {
  range: RangeKey;
  bucket: Bucket;
  rangeStart: string;
  rangeEnd: string;
  previous: { start: string; end: string } | null;
  kpis: {
    activeSubscribers: {
      current: number;
      previous: null;
      series: SeriesPoint[];
      renewals: { current: number; previous: number | null };
    };
    samplesPurchased: KpiMetric;
    creditUtilization: KpiMetric;
    royaltiesPaidUsd: KpiMetric;
    activeCreators: KpiMetric;
    newCreators: KpiMetric;
  };
  marketplace: {
    samplesPurchased: number;
    creditsRedeemed: number;
    creditsGranted: number;
    creditUtilizationPct: number | null;
    royaltiesPaidUsd: number;
    creditsOutstanding: number;
    purchasesSeries: SeriesPoint[];
  };
  content: {
    newSamples: number;
    newSamplesPrevious: number | null;
    totalPublishedSamples: number;
    avgPurchasesPerPurchasedSample: number | null;
    uploadsSeries: SeriesPoint[];
  };
  creatorEconomy: {
    creatorCount: number;
    creatorsWithSale: number;
    creatorsWithSalePct: number | null;
    avgEarningsUsd: number | null;
    medianEarningsUsd: number | null;
    topEarningsUsd: number | null;
    top10EarningsUsd: number | null;
  };
  subscriberHealth: {
    activeSubscribers: number;
    upgradeUsers: number;
    upgradeRatePct: number | null;
    avgCreditsRemaining: number | null;
  };
  today: {
    samplesPurchased: { today: number; yesterday: number };
    royaltiesPaidUsd: { today: number; yesterday: number };
    activeBuyers: { today: number; yesterday: number };
    creditsRedeemed: { today: number; yesterday: number };
    samplesUploaded: { today: number; yesterday: number };
  };
  actionItems: {
    pendingApplications: number;
    samplesInReview: number;
    presetsInReview: number;
  };
}
