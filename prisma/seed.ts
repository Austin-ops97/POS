import { PrismaClient } from "@prisma/client";
import { ensureRolesAndPermissions } from "../src/lib/roles-permissions";

const db = new PrismaClient();

async function main() {
  console.log("Seeding NexaPOS system roles and permissions...");

  const roleIds = await ensureRolesAndPermissions(db);

  console.log("Seed completed successfully!");
  console.log(`System roles: ${Object.keys(roleIds).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
