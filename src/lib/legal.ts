// Single source of truth for the current legal-policy version.
// Bump these when the policies change: every creator whose recorded acceptance
// predates TERMS_EFFECTIVE_DATE is re-prompted to accept on next sign-in
// (see components/legal/TermsReacceptanceGate). The legal pages render the
// label, so the date shown and the date enforced never drift apart.
export const TERMS_EFFECTIVE_DATE = "2026-06-01";
export const TERMS_EFFECTIVE_DATE_LABEL = "June 1, 2026";
