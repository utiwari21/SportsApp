-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimeSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sport" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "time" DATETIME NOT NULL,
    "duration" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeSlot" ("createdAt", "duration", "id", "location", "sport", "time", "userId") SELECT "createdAt", "duration", "id", "location", "sport", "time", "userId" FROM "TimeSlot";
DROP TABLE "TimeSlot";
ALTER TABLE "new_TimeSlot" RENAME TO "TimeSlot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
