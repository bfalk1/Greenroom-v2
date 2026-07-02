-- Add a terminal REMOVED state to the Sample and Preset status enums.
-- Moderator "delete" now sets this instead of reusing DRAFT, so removed items no
-- longer reappear in the moderation queue or get resubmitted by the creator.
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
ALTER TYPE "PresetStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
