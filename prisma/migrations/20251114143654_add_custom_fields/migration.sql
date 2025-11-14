-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customFieldResponses" JSONB;
