-- CreateTable
CREATE TABLE "ChatCharacter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "interests" TEXT NOT NULL,
    "speakingStyle" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#55ddb6',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPreferences" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minMinutes" INTEGER NOT NULL DEFAULT 120,
    "maxMinutes" INTEGER NOT NULL DEFAULT 360,
    "dailyLimit" INTEGER NOT NULL DEFAULT 6,
    "quietStart" INTEGER NOT NULL DEFAULT 22,
    "quietEnd" INTEGER NOT NULL DEFAULT 8,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "directCharacterId" TEXT,
    "romance" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minMinutes" INTEGER,
    "maxMinutes" INTEGER,
    "nextProactiveAt" TIMESTAMP(3) NOT NULL,
    "unattendedRounds" INTEGER NOT NULL DEFAULT 0,
    "lastReadSequence" INTEGER NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "repliedThrough" INTEGER NOT NULL DEFAULT 0,
    "memory" TEXT NOT NULL DEFAULT '',
    "memoryThrough" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "threadId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("threadId","characterId")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientMessageId" TEXT,
    "characterId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatJob" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggerSequence" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatCharacter_userId_archived_idx" ON "ChatCharacter"("userId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "ChatCharacter_userId_templateId_key" ON "ChatCharacter"("userId", "templateId");

-- CreateIndex
CREATE INDEX "ChatThread_userId_updatedAt_idx" ON "ChatThread"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ChatThread_archived_nextProactiveAt_idx" ON "ChatThread"("archived", "nextProactiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_userId_directCharacterId_key" ON "ChatThread"("userId", "directCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_threadId_sequence_key" ON "ChatMessage"("threadId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_threadId_clientMessageId_key" ON "ChatMessage"("threadId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatJob_key_key" ON "ChatJob"("key");

-- CreateIndex
CREATE INDEX "ChatJob_status_dueAt_idx" ON "ChatJob"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ChatJob_threadId_kind_createdAt_idx" ON "ChatJob"("threadId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDevice_token_key" ON "ChatDevice"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDevice_installationId_key" ON "ChatDevice"("installationId");

-- CreateIndex
CREATE INDEX "ChatDevice_userId_idx" ON "ChatDevice"("userId");

-- AddForeignKey
ALTER TABLE "ChatCharacter" ADD CONSTRAINT "ChatCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPreferences" ADD CONSTRAINT "ChatPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ChatCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ChatCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatJob" ADD CONSTRAINT "ChatJob_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDevice" ADD CONSTRAINT "ChatDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
