const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.emailTemplate.findMany({ orderBy: { eventKey: "asc" } });
  for (const row of all) {
    console.log(`\n========== ${row.eventKey} (updated ${row.updatedAt.toISOString()}) ==========`);
    console.log("SUBJECT:", row.subject);
    console.log("BODY:\n" + row.body);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
