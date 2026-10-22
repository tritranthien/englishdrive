-- CreateEnum
CREATE TYPE "VideoSourceType" AS ENUM ('YOUTUBE', 'DIRECT');

-- CreateEnum
CREATE TYPE "VideoSubtitleStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "VideoLesson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" "VideoSourceType" NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "status" "VideoSubtitleStatus" NOT NULL DEFAULT 'PROCESSING',
    "subtitles" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoLesson_userId_createdAt_idx" ON "VideoLesson"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "VideoLesson" ADD CONSTRAINT "VideoLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
