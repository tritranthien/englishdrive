-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "latestOriginal" TEXT NOT NULL,
    "latestSuggestion" TEXT NOT NULL,
    "explanationVi" TEXT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionMistake" (
    "sessionId" TEXT NOT NULL,
    "mistakeId" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "explanationVi" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMistake_pkey" PRIMARY KEY ("sessionId","mistakeId")
);

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "meaningVi" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "familiarity" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionVocabulary" (
    "sessionId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionVocabulary_pkey" PRIMARY KEY ("sessionId","vocabularyItemId")
);

-- CreateIndex
CREATE INDEX "Mistake_userId_occurrenceCount_lastSeenAt_idx" ON "Mistake"("userId", "occurrenceCount", "lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_userId_patternKey_key" ON "Mistake"("userId", "patternKey");

-- CreateIndex
CREATE INDEX "SessionMistake_mistakeId_idx" ON "SessionMistake"("mistakeId");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_nextReviewAt_lastSeenAt_idx" ON "VocabularyItem"("userId", "nextReviewAt", "lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyItem_userId_termKey_key" ON "VocabularyItem"("userId", "termKey");

-- CreateIndex
CREATE INDEX "SessionVocabulary_vocabularyItemId_idx" ON "SessionVocabulary"("vocabularyItemId");

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMistake" ADD CONSTRAINT "SessionMistake_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMistake" ADD CONSTRAINT "SessionMistake_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyItem" ADD CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVocabulary" ADD CONSTRAINT "SessionVocabulary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVocabulary" ADD CONSTRAINT "SessionVocabulary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
