-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "interview_context_id" UUID;

-- CreateTable
CREATE TABLE "interview_contexts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "role" TEXT NOT NULL,
    "company" TEXT,
    "industry" TEXT,
    "resume_id" UUID,
    "job_description_id" UUID,
    "resume_text" TEXT,
    "job_description_text" TEXT,
    "generated_context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_contexts_user_id_created_at_idx" ON "interview_contexts"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_interview_context_id_fkey" FOREIGN KEY ("interview_context_id") REFERENCES "interview_contexts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

