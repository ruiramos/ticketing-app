-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "EventExtras" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "EventExtras_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EventExtras" ADD CONSTRAINT "EventExtras_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
