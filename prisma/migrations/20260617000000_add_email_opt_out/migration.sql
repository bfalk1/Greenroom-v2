-- Add marketing unsubscribe flag. NULL = subscribed; timestamp = when the user opted out.
ALTER TABLE "users" ADD COLUMN "email_opt_out_at" TIMESTAMP(3);
