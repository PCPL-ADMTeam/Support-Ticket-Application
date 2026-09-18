// Idempotent seed script: safe to re-run. Creates the three system roles,
// a default admin account, sample teams/categories/priorities/SLA policies,
// a few extra users, and a handful of sample tickets to populate the
// dashboard on first run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { formatTicketNumber } = require("../src/utils/ticketNumber");

const prisma = new PrismaClient();

async function upsertRole(name, label) {
  return prisma.role.upsert({ where: { name }, update: {}, create: { name, label } });
}

async function upsertUser({ name, email, password, roleId }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash, roleId },
  });
}

async function main() {
  console.log("Seeding database...");

  const [adminRole, agentRole, userRole] = await Promise.all([
    upsertRole("ADMIN", "Administrator"),
    upsertRole("AGENT", "Agent / Technician"),
    upsertRole("USER", "End User"),
  ]);

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@helpdesk.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const admin = await upsertUser({ name: "System Administrator", email: adminEmail, password: adminPassword, roleId: adminRole.id });

  const agent1 = await upsertUser({ name: "Alex Agent", email: "alex.agent@helpdesk.local", password: "Agent@12345", roleId: agentRole.id });
  const agent2 = await upsertUser({ name: "Sam Support", email: "sam.support@helpdesk.local", password: "Agent@12345", roleId: agentRole.id });
  const endUser1 = await upsertUser({ name: "Jamie User", email: "jamie.user@helpdesk.local", password: "User@12345", roleId: userRole.id });
  const endUser2 = await upsertUser({ name: "Riley Requester", email: "riley.requester@helpdesk.local", password: "User@12345", roleId: userRole.id });

  const team = await prisma.team.upsert({
    where: { name: "Service Desk" },
    update: {},
    create: {
      name: "Service Desk",
      description: "Tier-1 IT support team",
      members: { create: [{ userId: agent1.id }, { userId: agent2.id }] },
    },
  });

  const categoryDefs = [
    { name: "Hardware", children: ["Laptop", "Printer", "Peripherals"] },
    { name: "Software", children: ["Installation", "Licensing", "Bug Report"] },
    { name: "Network", children: ["VPN", "Wi-Fi", "Connectivity"] },
    { name: "Access Request", children: ["New Account", "Permission Change"] },
  ];

  const categories = [];
  for (const def of categoryDefs) {
    // Prisma's compound-unique `where` type rejects `null` for parentId
    // (a known limitation), so top-level categories can't use upsert()
    // directly — fall back to findFirst + create.
    let parent = await prisma.category.findFirst({ where: { name: def.name, parentId: null } });
    if (!parent) {
      parent = await prisma.category.create({ data: { name: def.name } });
    }
    categories.push(parent);
    for (const childName of def.children) {
      await prisma.category.upsert({
        where: { name_parentId: { name: childName, parentId: parent.id } },
        update: {},
        create: { name: childName, parentId: parent.id },
      });
    }
  }

  // Colors are the validated good/warning/serious/critical status steps
  // (see client/src/theme/theme.js STATUS_SCALE) — Low/Medium/High/Critical
  // map naturally onto that fixed, accessibility-checked severity scale.
  const priorityDefs = [
    { name: "Low", level: 1, color: "#0ca30c", responseTimeMinutes: 480, resolutionTimeMinutes: 4320 },
    { name: "Medium", level: 2, color: "#fab219", responseTimeMinutes: 240, resolutionTimeMinutes: 1440 },
    { name: "High", level: 3, color: "#ec835a", responseTimeMinutes: 60, resolutionTimeMinutes: 480 },
    { name: "Critical", level: 4, color: "#d03b3b", responseTimeMinutes: 15, resolutionTimeMinutes: 120 },
  ];

  const priorities = {};
  for (const def of priorityDefs) {
    const priority = await prisma.priority.upsert({
      where: { name: def.name },
      update: { level: def.level, color: def.color },
      create: { name: def.name, level: def.level, color: def.color },
    });
    await prisma.slaPolicy.upsert({
      where: { priorityId: priority.id },
      update: { responseTimeMinutes: def.responseTimeMinutes, resolutionTimeMinutes: def.resolutionTimeMinutes },
      create: { priorityId: priority.id, responseTimeMinutes: def.responseTimeMinutes, resolutionTimeMinutes: def.resolutionTimeMinutes },
    });
    priorities[def.name] = priority;
  }

  const existingTickets = await prisma.ticket.count();
  if (existingTickets === 0) {
    console.log("Creating sample tickets...");
    const sampleTickets = [
      { title: "Laptop won't power on", description: "My laptop screen stays black even when plugged in.", category: "Laptop", priority: "High", status: "OPEN", requester: endUser1, assignee: agent1 },
      { title: "Need VPN access from home", description: "Requesting VPN client installation for remote work.", category: "VPN", priority: "Medium", status: "IN_PROGRESS", requester: endUser2, assignee: agent2 },
      { title: "Printer on 3rd floor jamming", description: "Paper jams on every 5th print job.", category: "Printer", priority: "Low", status: "RESOLVED", requester: endUser1, assignee: agent1 },
      { title: "Production app throwing 500 errors", description: "Customers cannot check out; urgent.", category: "Bug Report", priority: "Critical", status: "OPEN", requester: endUser2, assignee: agent2 },
      { title: "New hire account setup", description: "Please provision an account for the new analyst starting Monday.", category: "New Account", priority: "Medium", status: "CLOSED", requester: endUser1, assignee: agent1 },
    ];

    for (const t of sampleTickets) {
      const category = await prisma.category.findFirst({ where: { name: t.category } });
      const priority = priorities[t.priority];
      const created = await prisma.ticket.create({
        data: {
          ticketNumber: "PENDING",
          title: t.title,
          description: t.description,
          categoryId: category.id,
          priorityId: priority.id,
          requesterId: t.requester.id,
          assigneeId: t.assignee.id,
          teamId: team.id,
          status: t.status,
          dueAt: new Date(Date.now() + 24 * 3600 * 1000),
          resolvedAt: ["RESOLVED", "CLOSED"].includes(t.status) ? new Date() : null,
          closedAt: t.status === "CLOSED" ? new Date() : null,
        },
      });
      await prisma.ticket.update({ where: { id: created.id }, data: { ticketNumber: formatTicketNumber(created.seq) } });
      await prisma.ticketHistory.create({ data: { ticketId: created.id, userId: admin.id, action: "CREATED" } });
      await prisma.ticketComment.create({
        data: { ticketId: created.id, authorId: t.requester.id, body: "Please look into this as soon as possible.", isInternal: false },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`  Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`  Agent login: ${agent1.email} / Agent@12345`);
  console.log(`  User login:  ${endUser1.email} / User@12345`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
