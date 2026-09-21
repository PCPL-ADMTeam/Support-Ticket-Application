// One-time data upgrade: converts the plain-text EmailTemplate bodies
// created by the original seed into the new HTML versions (with a proper
// "View Ticket" button), WITHOUT touching any row an Admin has already
// customized away from that original text. Never deletes/recreates rows,
// never touches eventKey/isActive/subject — only `body`, and only when it
// still exactly matches the known original plain-text default.
//
// Run once: node prisma/migrateEmailTemplatesToHtml.js
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { emailTemplateDefaults, legacyPlainTextBodies } = require("./emailTemplateDefaults");

const prisma = new PrismaClient();

async function main() {
  for (const def of emailTemplateDefaults) {
    const existing = await prisma.emailTemplate.findUnique({ where: { eventKey: def.eventKey } });
    if (!existing) {
      console.log(`[skip] ${def.eventKey}: no row found (run prisma/seed.js first)`);
      continue;
    }
    if (existing.body !== legacyPlainTextBodies[def.eventKey]) {
      console.log(`[skip] ${def.eventKey}: body doesn't match the original seed text — looks Admin-customized, leaving it untouched`);
      continue;
    }
    await prisma.emailTemplate.update({ where: { eventKey: def.eventKey }, data: { body: def.body } });
    console.log(`[updated] ${def.eventKey}: body converted to HTML`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
