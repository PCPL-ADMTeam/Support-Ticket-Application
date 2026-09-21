// Idempotent seed script: safe to re-run. Creates the three system roles
// (ADMIN / MANAGER / USER), a default admin account, sample departments each
// with exactly one Manager, a handful of department Users, and sample
// tickets to populate the dashboard on first run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { formatTicketNumber } = require("../src/utils/ticketNumber");

const prisma = new PrismaClient();

async function upsertRole(name, label) {
  return prisma.role.upsert({ where: { name }, update: {}, create: { name, label } });
}

async function upsertUser({ name, email, password, roleId, departmentId }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { roleId, departmentId: departmentId ?? undefined },
    create: { name, email, passwordHash, roleId, departmentId: departmentId || null },
  });
}

async function main() {
  console.log("Seeding database...");

  const [adminRole, managerRole, userRole] = await Promise.all([
    upsertRole("ADMIN", "Administrator"),
    upsertRole("MANAGER", "Department Manager"),
    upsertRole("USER", "End User"),
  ]);

  // One-time cleanup for environments seeded before the Admin/Manager/User
  // role model: reassign any leftover AGENT-role users to USER (a Manager
  // among them gets promoted properly below via Department.managerId) and
  // drop the now-unused role row so it can never be selected again.
  const legacyAgentRole = await prisma.role.findUnique({ where: { name: "AGENT" } });
  if (legacyAgentRole) {
    await prisma.user.updateMany({ where: { roleId: legacyAgentRole.id }, data: { roleId: userRole.id } });
    await prisma.role.delete({ where: { id: legacyAgentRole.id } });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@helpdesk.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const admin = await upsertUser({ name: "System Administrator", email: adminEmail, password: adminPassword, roleId: adminRole.id });

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

  // Departments: each gets exactly ONE manager user and a couple of regular
  // (role USER) members who can be assigned tickets by that manager, plus a
  // predefined issue list powering the ticket form's Department / Issue
  // dropdowns. Every department gets a trailing "Others" issue (isOther:
  // true) for the custom-issue-text fallback.
  const departmentDefs = [
    {
      name: "IT",
      manager: { name: "IT Manager", email: "it.manager@helpdesk.local" },
      members: [{ name: "Alex Tech", email: "alex.tech@helpdesk.local" }, { name: "Sam Support", email: "sam.support@helpdesk.local" }],
      issues: [
        "Laptop / Desktop Issue", "Network Issue", "Internet Connectivity", "Software Installation",
        "Application Access", "Email / Outlook Issue", "VPN Issue", "Password Reset",
        "System Performance", "Printer Issue",
      ],
    },
    {
      name: "HR",
      manager: { name: "HR Manager", email: "hr.manager@helpdesk.local" },
      members: [{ name: "Priya HR", email: "priya.hr@helpdesk.local" }],
      issues: [
        "Leave Issue", "Attendance Issue", "Payroll Issue", "Employee Information Update",
        "Onboarding Issue", "Offboarding Issue", "Policy Clarification", "Document Request",
      ],
    },
    {
      name: "Finance",
      manager: { name: "Finance Manager", email: "finance.manager@helpdesk.local" },
      members: [{ name: "Accounts Executive", email: "accounts.exec@helpdesk.local" }],
      issues: ["Invoice Issue", "Payment Issue", "Expense Claim", "Purchase Request", "Billing Issue", "Budget Request"],
    },
    {
      name: "Administration",
      manager: { name: "Admin Manager", email: "admin.manager@helpdesk.local" },
      members: [{ name: "Facilities Executive", email: "facilities.exec@helpdesk.local" }],
      issues: ["Facility Issue", "Office Equipment", "Access Card", "Transport Issue", "Housekeeping Issue", "Maintenance Issue"],
    },
    {
      name: "Sales",
      manager: { name: "Sales Manager", email: "sales.manager@helpdesk.local" },
      members: [{ name: "Sales Executive", email: "sales.exec@helpdesk.local" }],
      issues: ["CRM Issue", "Customer Data Issue", "Sales Application Access", "Report Issue", "Customer Support Issue"],
    },
  ];

  const managerPassword = process.env.SEED_MANAGER_PASSWORD || "Manager@12345";
  const memberPassword = process.env.SEED_USER_PASSWORD || "User@12345";

  const departments = {};
  const managers = {};
  const members = {}; // departmentName -> [User]

  for (const def of departmentDefs) {
    const department = await prisma.department.upsert({ where: { name: def.name }, update: {}, create: { name: def.name } });
    departments[def.name] = department;

    const manager = await upsertUser({
      name: def.manager.name,
      email: def.manager.email,
      password: managerPassword,
      roleId: managerRole.id,
      departmentId: department.id,
    });
    managers[def.name] = manager;

    await prisma.department.update({ where: { id: department.id }, data: { managerId: manager.id } });

    members[def.name] = [];
    for (const m of def.members) {
      const member = await upsertUser({ name: m.name, email: m.email, password: memberPassword, roleId: userRole.id, departmentId: department.id });
      members[def.name].push(member);
    }

    for (const issueName of def.issues) {
      await prisma.issue.upsert({
        where: { name_departmentId: { name: issueName, departmentId: department.id } },
        update: {},
        create: { name: issueName, departmentId: department.id },
      });
    }
    await prisma.issue.upsert({
      where: { name_departmentId: { name: "Others", departmentId: department.id } },
      update: {},
      create: { name: "Others", departmentId: department.id, isOther: true },
    });
  }

  // A couple of plain requesters (role USER) who raise tickets across
  // departments but aren't anyone's direct report — same as the previous
  // "end user" seed accounts.
  const jamie = await upsertUser({ name: "Jamie User", email: "jamie.user@helpdesk.local", password: memberPassword, roleId: userRole.id, departmentId: departments.IT.id });
  const riley = await upsertUser({ name: "Riley Requester", email: "riley.requester@helpdesk.local", password: memberPassword, roleId: userRole.id, departmentId: departments.HR.id });

  const existingTickets = await prisma.ticket.count();
  if (existingTickets === 0) {
    console.log("Creating sample tickets...");
    const itIssue = await prisma.issue.findFirst({ where: { departmentId: departments.IT.id, name: "Laptop / Desktop Issue" } });
    const vpnIssue = await prisma.issue.findFirst({ where: { departmentId: departments.IT.id, name: "VPN Issue" } });
    const printerIssue = await prisma.issue.findFirst({ where: { departmentId: departments.IT.id, name: "System Performance" } });

    const sampleTickets = [
      { title: "Laptop won't power on", description: "My laptop screen stays black even when plugged in.", category: "Laptop", priority: "High", status: "OPEN", requester: jamie, assignee: members.IT[0], issue: itIssue },
      { title: "Need VPN access from home", description: "Requesting VPN client installation for remote work.", category: "VPN", priority: "Medium", status: "IN_PROGRESS", requester: riley, assignee: members.IT[1], issue: vpnIssue },
      { title: "Printer on 3rd floor jamming", description: "Paper jams on every 5th print job.", category: "Printer", priority: "Low", status: "RESOLVED", requester: jamie, assignee: members.IT[0], issue: printerIssue },
      { title: "Production app throwing 500 errors", description: "Customers cannot check out; urgent.", category: "Bug Report", priority: "Critical", status: "OPEN", requester: riley, assignee: null, issue: itIssue },
      { title: "New hire account setup", description: "Please provision an account for the new analyst starting Monday.", category: "New Account", priority: "Medium", status: "CLOSED", requester: jamie, assignee: members.IT[0], issue: itIssue },
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
          assigneeId: t.assignee?.id || null,
          fromDepartmentId: t.requester.departmentId,
          toDepartmentId: departments.IT.id,
          managerId: managers.IT.id,
          issueId: t.issue?.id || null,
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
  console.log(`  Admin login:   ${adminEmail} / ${adminPassword}`);
  console.log(`  Manager login: it.manager@helpdesk.local / ${managerPassword}`);
  console.log(`  User login:    ${jamie.email} / ${memberPassword}`);
  console.log(`  Dept. member:  alex.tech@helpdesk.local / ${memberPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
