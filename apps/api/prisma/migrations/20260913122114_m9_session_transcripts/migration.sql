-- CreateEnum
CREATE TYPE "TranscriptRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "ConversationSession" ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" TEXT;

-- CreateTable
CREATE TABLE "TranscriptMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "role" "TranscriptRole" NOT NULL,
    "content" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptMessage_sessionId_occurredAt_idx" ON "TranscriptMessage"("sessionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptMessage_sessionId_clientMessageId_key" ON "TranscriptMessage"("sessionId", "clientMessageId");

-- AddForeignKey
ALTER TABLE "TranscriptMessage" ADD CONSTRAINT "TranscriptMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
