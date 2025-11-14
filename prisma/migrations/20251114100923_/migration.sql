/*
  Warnings:

  - You are about to drop the column `checkedIn` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `checkedInAt` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "checkedIn",
DROP COLUMN "checkedInAt";
