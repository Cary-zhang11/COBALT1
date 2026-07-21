-- Remove userId binding from TaskFeedback: feedback is now task-scoped, visible to all users
ALTER TABLE "TaskFeedback" DROP CONSTRAINT IF EXISTS "TaskFeedback_userId_fkey";
ALTER TABLE "TaskFeedback" DROP COLUMN IF EXISTS "userId";
