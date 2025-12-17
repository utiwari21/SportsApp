import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Delete all time slots
  await prisma.timeSlot.deleteMany({});
  console.log("All TimeSlot entries deleted.");
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
