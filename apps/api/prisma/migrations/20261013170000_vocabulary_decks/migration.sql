CREATE TABLE "VocabularyDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VocabularyDeck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VocabularyDeck_userId_nameKey_key" ON "VocabularyDeck"("userId", "nameKey");
CREATE INDEX "VocabularyDeck_userId_createdAt_idx" ON "VocabularyDeck"("userId", "createdAt");
ALTER TABLE "VocabularyItem" ADD COLUMN "deckId" TEXT;
CREATE INDEX "VocabularyItem_userId_deckId_idx" ON "VocabularyItem"("userId", "deckId");
ALTER TABLE "VocabularyDeck" ADD CONSTRAINT "VocabularyDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyItem" ADD CONSTRAINT "VocabularyItem_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "VocabularyDeck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
