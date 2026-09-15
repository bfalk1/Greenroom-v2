// Canonical email normalization. Supabase GoTrue lowercases the email on signup,
// so authUser.email is always lowercase in server code. Any email we STORE or look
// up (invites, user records, etc.) must be normalized the same way or case-only
// differences silently break exact-match lookups on the @unique email columns.
//
// Lives in its own module so dependency-free code (unsubscribeToken.ts) can use
// it without importing Prisma and Resend; email.ts re-exports it.
export const normalizeEmail = (email: string): string => email.toLowerCase().trim();
