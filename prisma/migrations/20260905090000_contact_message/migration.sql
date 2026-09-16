-- Public contact form submissions. Deliberately not linked to a Facility: whoever writes in
-- usually doesn't have an account yet.
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "slot" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
