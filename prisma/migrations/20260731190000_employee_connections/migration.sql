CREATE TYPE "ConnectionConversationType" AS ENUM ('DIRECT', 'GROUP', 'EVERYONE');

CREATE TABLE "ConnectionConversation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" "ConnectionConversationType" NOT NULL,
  "name" TEXT,
  "createdById" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ConnectionConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectionConversationMember" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReadAt" TIMESTAMP(3),
  "muted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ConnectionConversationMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectionMessage" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "replyToId" TEXT,
  "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectionMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectionMessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectionMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectionConversation_businessId_lastMessageAt_idx" ON "ConnectionConversation"("businessId", "lastMessageAt");
CREATE INDEX "ConnectionConversation_businessId_type_idx" ON "ConnectionConversation"("businessId", "type");
CREATE UNIQUE INDEX "ConnectionConversationMember_conversationId_employeeId_key" ON "ConnectionConversationMember"("conversationId", "employeeId");
CREATE INDEX "ConnectionConversationMember_employeeId_lastReadAt_idx" ON "ConnectionConversationMember"("employeeId", "lastReadAt");
CREATE INDEX "ConnectionMessage_conversationId_createdAt_idx" ON "ConnectionMessage"("conversationId", "createdAt");
CREATE INDEX "ConnectionMessage_businessId_createdAt_idx" ON "ConnectionMessage"("businessId", "createdAt");
CREATE INDEX "ConnectionMessage_replyToId_idx" ON "ConnectionMessage"("replyToId");
CREATE UNIQUE INDEX "ConnectionMessageReaction_messageId_employeeId_emoji_key" ON "ConnectionMessageReaction"("messageId", "employeeId", "emoji");
CREATE INDEX "ConnectionMessageReaction_messageId_idx" ON "ConnectionMessageReaction"("messageId");

ALTER TABLE "ConnectionConversation" ADD CONSTRAINT "ConnectionConversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionConversation" ADD CONSTRAINT "ConnectionConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConnectionConversationMember" ADD CONSTRAINT "ConnectionConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ConnectionConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionConversationMember" ADD CONSTRAINT "ConnectionConversationMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessage" ADD CONSTRAINT "ConnectionMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessage" ADD CONSTRAINT "ConnectionMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ConnectionConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessage" ADD CONSTRAINT "ConnectionMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessage" ADD CONSTRAINT "ConnectionMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ConnectionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessageReaction" ADD CONSTRAINT "ConnectionMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConnectionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionMessageReaction" ADD CONSTRAINT "ConnectionMessageReaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH connection_permissions("key") AS (
  VALUES ('view_connections'), ('send_connection_messages'), ('manage_connections')
)
INSERT INTO "Permission" ("id", "key", "name", "description", "createdAt", "updatedAt")
SELECT 'perm_' || md5("key"), "key", initcap(replace("key", '_', ' ')), 'Permission: ' || "key", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM connection_permissions
ON CONFLICT ("key") DO NOTHING;

WITH role_permissions("roleName", "permissionKey") AS (
  VALUES
    ('Owner','view_connections'), ('Owner','send_connection_messages'), ('Owner','manage_connections'),
    ('Admin','view_connections'), ('Admin','send_connection_messages'), ('Admin','manage_connections'),
    ('Manager','view_connections'), ('Manager','send_connection_messages'), ('Manager','manage_connections'),
    ('Cashier','view_connections'), ('Cashier','send_connection_messages'),
    ('Inventory Staff','view_connections'), ('Inventory Staff','send_connection_messages'),
    ('Reports Viewer','view_connections'), ('Reports Viewer','send_connection_messages'),
    ('Finance','view_connections'), ('Finance','send_connection_messages')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp_' || md5(r."id" || ':' || p."id"), r."id", p."id"
FROM role_permissions rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "ConnectionConversation" ("id", "businessId", "type", "name", "createdAt", "updatedAt")
SELECT 'conn_' || md5(b."id" || ':everyone'), b."id", 'EVERYONE', 'Everyone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business" b;

INSERT INTO "ConnectionConversationMember" ("id", "conversationId", "employeeId", "joinedAt")
SELECT 'cm_' || md5(c."id" || ':' || e."id"), c."id", e."id", CURRENT_TIMESTAMP
FROM "ConnectionConversation" c
JOIN "EmployeeProfile" e ON e."businessId" = c."businessId"
WHERE c."type" = 'EVERYONE' AND e."status" = 'ACTIVE' AND e."deletedAt" IS NULL
ON CONFLICT ("conversationId", "employeeId") DO NOTHING;
