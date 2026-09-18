const app = require("./app");
const env = require("./config/env");
const prisma = require("./config/prisma");
const { startSlaBreachJob } = require("./jobs/slaBreachCheck");

const server = app.listen(env.port, () => {
  console.log(`Helpdesk API listening on port ${env.port} [${env.nodeEnv}]`);
  startSlaBreachJob();
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
