-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageDeclaredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CreatorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "bio" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "CreatorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorApplication_status_createdAt_idx" ON "CreatorApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorApplication_userId_createdAt_idx" ON "CreatorApplication"("userId", "createdAt");
