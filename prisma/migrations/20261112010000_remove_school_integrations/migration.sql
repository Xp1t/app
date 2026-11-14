BEGIN;

DELETE FROM "Notification" WHERE "kind" = 'olympiad';
ALTER TABLE "Notification" DROP COLUMN "link";
ALTER TABLE "Family" DROP COLUMN "schoolKey";
ALTER TABLE "Task" DROP COLUMN "externalId";
DROP TABLE "Olympiad";

COMMIT;
