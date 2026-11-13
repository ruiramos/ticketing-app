-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "emailNotes" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "emailMessage" TEXT;

-- Backfill: the confirmation email used to build its details list from the
-- "- " lines in the event description, so keep those as the email notes
UPDATE "Event" e
SET "emailNotes" = notes.lines
FROM (
  SELECT "id", string_agg(btrim(t.line), E'\n' ORDER BY t.ord) AS lines
  FROM "Event",
    regexp_split_to_table("text", E'\r?\n') WITH ORDINALITY AS t(line, ord)
  WHERE btrim(t.line) LIKE '- %'
  GROUP BY "id"
) notes
WHERE e."id" = notes."id";

-- Backfill: this message used to be hardcoded in the email template
UPDATE "Organization"
SET "emailMessage" = 'Your contribution helps fund the PTA projects and community events.';
