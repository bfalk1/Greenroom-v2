// Sample type is stored as the Postgres enum SampleType (LOOP | ONE_SHOT).
// Legacy rows may be lowercase, so normalize before formatting for display.
export function formatSampleType(value?: string | null): string {
  switch ((value || "").toUpperCase()) {
    case "LOOP":
      return "Loop";
    case "ONE_SHOT":
      return "One-Shot";
    default:
      return value || "—";
  }
}
