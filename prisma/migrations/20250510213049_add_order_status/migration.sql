/*
  Warnings:

  - You are about to drop the `ReservedTicket` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `quantity` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "ReservedTicket" DROP CONSTRAINT "ReservedTicket_eventId_fkey";

-- DropForeignKey
ALTER TABLE "ReservedTicket" DROP CONSTRAINT "ReservedTicket_variantId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "status" "OrderStatus" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "ReservedTicket";
