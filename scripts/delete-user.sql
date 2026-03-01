-- Delete a user and all related data
-- Replace the UUID below with the user you want to delete

DO $$
DECLARE
  target_user_id UUID := '2bc4f0b2-a4df-4eb8-9d80-a8f5418efb1d';  -- <-- CHANGE THIS
BEGIN
  -- 1. Audit logs
  DELETE FROM audit_logs WHERE actor_id = target_user_id;
  
  -- 2. Creator payout summaries
  DELETE FROM creator_payout_summaries WHERE creator_id = target_user_id;
  
  -- 3. Invite codes (as inviter or used by)
  DELETE FROM invite_codes WHERE invited_by = target_user_id OR used_by_user_id = target_user_id;
  
  -- 4. Clear reviewer from creator applications
  UPDATE creator_applications SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  
  -- 5. Delete samples (cascades to downloads, plays, likes, purchases)
  DELETE FROM samples WHERE creator_id = target_user_id;
  
  -- 6. Delete the user (cascades to subscriptions, credit_balances, credit_transactions, follows, creator_applications)
  DELETE FROM users WHERE id = target_user_id;
  
  RAISE NOTICE 'User % deleted successfully', target_user_id;
END $$;
