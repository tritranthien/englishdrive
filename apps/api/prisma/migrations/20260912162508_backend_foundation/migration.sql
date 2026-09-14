-- CreateEnum
CREATE TYPE "EnglishLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LanguageMode" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'IMMERSION');

-- CreateEnum
CREATE TYPE "CorrectionMode" AS ENUM ('IMPORTANT_ONLY', 'FREQUENT', 'ON_REQUEST');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('COMMUTE', 'FREE_TALK', 'PRACTICE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "EnglishLevel" NOT NULL DEFAULT 'UNKNOWN',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'vi',
    "languageMode" "LanguageMode" NOT NULL DEFAULT 'INTERMEDIATE',
    "englishRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "correctionMode" "CorrectionMode" NOT NULL DEFAULT 'IMPORTANT_ONLY',
    "conversationStyle" TEXT NOT NULL DEFAULT 'friendly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProfile_userId_key" ON "LearningProfile"("userId");

-- CreateIndex
CREATE INDEX "ConversationSession_userId_startedAt_idx" ON "ConversationSession"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationSession_userId_status_idx" ON "ConversationSession"("userId", "status");

-- AddForeignKey
ALTER TABLE "LearningProfile" ADD CONSTRAINT "LearningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
