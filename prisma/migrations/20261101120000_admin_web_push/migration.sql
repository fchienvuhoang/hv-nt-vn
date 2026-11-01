CREATE TABLE "PushPreference" (
 "email" TEXT PRIMARY KEY, "wrongAccount" BOOLEAN NOT NULL DEFAULT false,
 "needsClassification" BOOLEAN NOT NULL DEFAULT false, "syncError" BOOLEAN NOT NULL DEFAULT false,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AdminPushSubscription" (
 "id" TEXT PRIMARY KEY, "endpoint" TEXT NOT NULL UNIQUE, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
 "email" TEXT NOT NULL REFERENCES "PushPreference"("email") ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AdminPushSubscription_email_idx" ON "AdminPushSubscription"("email");
CREATE TABLE "AdminPushDelivery" (
 "id" TEXT PRIMARY KEY, "subscriptionId" TEXT NOT NULL REFERENCES "AdminPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "eventKey" TEXT NOT NULL, "kind" TEXT NOT NULL, "transactionId" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AdminPushDelivery_subscriptionId_eventKey_key" ON "AdminPushDelivery"("subscriptionId","eventKey");
CREATE INDEX "AdminPushDelivery_finishedAt_nextAttemptAt_idx" ON "AdminPushDelivery"("finishedAt","nextAttemptAt");
