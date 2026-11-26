-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT;

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Report_mediaId_status_idx" ON "Report"("mediaId", "status");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");
