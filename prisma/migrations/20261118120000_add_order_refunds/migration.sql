-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'REFUNDED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundError" JSONB,
ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "refundedAmount" DOUBLE PRECISION,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
