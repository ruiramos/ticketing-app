/*
  Warnings:

  - You are about to drop the column `order` on the `Variant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Variant" DROP COLUMN "order",
ADD COLUMN     "displayOrder" SERIAL NOT NULL;
