-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmationEmailError" TEXT,
ADD COLUMN     "confirmationEmailSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");
