CREATE TABLE "ApiKeySetting" (
    "provider" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKeySetting_pkey" PRIMARY KEY ("provider")
);
