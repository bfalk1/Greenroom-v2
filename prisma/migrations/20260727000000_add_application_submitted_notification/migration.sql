-- Staff-facing notification type: a creator application awaits review.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMITTED';
