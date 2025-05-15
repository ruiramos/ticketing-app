-- AlterTable
ALTER TABLE "EventExtras" ADD COLUMN     "multiple" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "multipleLimit" INTEGER,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "currency" DROP NOT NULL;
