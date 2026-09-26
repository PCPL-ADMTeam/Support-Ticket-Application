// Centralized, non-environment business constants — values here are fixed
// application rules (not deployment config), so they live in code rather
// than .env, but in exactly ONE place so nothing else hardcodes them.

// Maximum number of TEAMLEADs that may simultaneously have department access
// (UserDepartmentAccess rows) for the same department. Enforced server-side
// in userDepartmentAccess.service.js; the frontend (Department Details,
// Admin Users) reads this same value via GET /departments (each department's
// `maxTeamLeads` field) rather than hardcoding it, so changing this one
// number is the only change needed to raise/lower the limit everywhere.
// There is deliberately NO equivalent cap for MANAGER — a department may
// have any number of Managers.
const MAX_TEAMLEADS_PER_DEPARTMENT = 2;

module.exports = { MAX_TEAMLEADS_PER_DEPARTMENT };
