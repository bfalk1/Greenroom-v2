-- Creator/beta invite emails were stored verbatim from admin input, but every
-- acceptance path looks the invite up by the Supabase auth email, which GoTrue
-- always lowercases. Any invite created with an uppercase letter therefore never
-- matched at sign-in: the invitee was created as a plain USER with no CREATOR
-- role (or, for beta invites, no credits / paywall bypass). The code now
-- normalizes on write (see normalizeEmail); this backfills existing rows so the
-- already-lowercased lookups match them.
--
-- Guarded with NOT EXISTS so a (vanishingly unlikely) pair of invites that differ
-- only by case can't trip the @unique constraint and fail the migration — any
-- such collision is left untouched for manual cleanup rather than blocking deploy.

UPDATE "creator_invites" ci
SET "email" = lower(ci."email")
WHERE ci."email" <> lower(ci."email")
  AND NOT EXISTS (
    SELECT 1 FROM "creator_invites" other
    WHERE other."id" <> ci."id" AND other."email" = lower(ci."email")
  );

UPDATE "beta_invites" bi
SET "email" = lower(bi."email")
WHERE bi."email" <> lower(bi."email")
  AND NOT EXISTS (
    SELECT 1 FROM "beta_invites" other
    WHERE other."id" <> bi."id" AND other."email" = lower(bi."email")
  );
