/*
  Warnings:

  - Added the required column `externalOrderId` to the `ReservedTicket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ReservedTicket" ADD COLUMN     "externalOrderId" TEXT NOT NULL;
