-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYPAL', 'CASH', 'CARD_IN_PERSON', 'BANK_TRANSFER', 'COMP');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAYPAL';

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
