-- App-level integration secrets. Values are AES-256-GCM ciphertext, never plaintext.

CREATE TABLE "PlatformCredential" (
    "key" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "hint" TEXT,
    "updatedById" TEXT,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("key")
);
