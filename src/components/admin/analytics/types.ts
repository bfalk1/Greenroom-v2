// Shared types for the admin analytics Overview — mirrors the response
// shapes of GET /api/admin/analytics and GET /api/admin/analytics/trend.

/** "hour" keys are `YYYY-MM-DDTHH`, month keys `YYYY-MM`, the rest `YYYY-MM-DD`. */
export type Granularity = "hour" | "day" | "week" | "month";

export interface SeriesPoint {
  date: string;
  /** null = "no data" for the bucket (charts render a gap, not 0). */
  value: number | null;
}

export interface ConversionPoint extends SeriesPoint {
  visitors: number;
  conversions: number;
}

export interface ConversionWindow {
  visitors: number;
  conversions: number;
  ratePct: number | null;
  prevVisitors: number;
  prevConversions: number;
  prevRatePct: number | null;
}

export interface ConversionPayload {
  window: ConversionWindow;
  series: ConversionPoint[];
}

export interface DailyMetric {
  today: number;
  yesterday: number;
  last7: number;
  series: SeriesPoint[];
}

export interface OverviewResponse {
  generatedAt: string;
  engagement: {
    activeNow: { current: number; windowMinutes: number; series: SeriesPoint[] };
    dau: { today: number; yesterday: number; series: SeriesPoint[] };
    wau: { current: number; previous: number; series: SeriesPoint[] };
    mau: { current: number; previous: number; series: SeriesPoint[] };
  };
  commerce: {
    purchases: DailyMetric;
    credits: DailyMetric;
    subs: DailyMetric & { activeTotal: number };
  };
  conversion: {
    configured: boolean;
    error: string | null;
    landing: ConversionPayload | null;
    promo: ConversionPayload | null;
  };
  actionItems: {
    pendingApplications: number;
    samplesInReview: number;
    presetsInReview: number;
  };
}

export type MetricKey =
  | "active"
  | "dau"
  | "wau"
  | "mau"
  | "purchases"
  | "credits"
  | "subs"
  | "landing_conversion"
  | "promo_conversion";

export interface TrendResponse {
  metric: MetricKey;
  range: string;
  granularity: Granularity;
  series: SeriesPoint[] | ConversionPoint[];
  /** Present on metric=active — current headcount for the tile. */
  activeNow?: { current: number; windowMinutes: number };
}
