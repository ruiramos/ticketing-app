-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "checkedIn" BOOLEAN DEFAULT false,
ADD COLUMN     "checkedInAt" TIMESTAMP(3);
