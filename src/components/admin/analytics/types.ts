// Shared types for the admin analytics Overview — mirrors the response shape
// of GET /api/admin/analytics.

export type RangeKey = "7d" | "30d" | "90d" | "all";
export type Bucket = "day" | "week" | "month";

export interface SeriesPoint {
  date: string;
  /** null = "no data" for the bucket (charts render a gap, not 0). */
  value: number | null;
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
  /** Server-local YYYY-MM-DD keys matching the series bucket-key convention. */
  rangeStartDay: string;
  rangeEndDay: string;
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
    compedSubscribers: number;
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
