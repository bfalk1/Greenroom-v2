-- Drop users.credits — credit_balances.balance is now the single source of truth.
-- All call sites have been migrated to read/write credit_balances exclusively.
ALTER TABLE "users" DROP COLUMN "credits";
