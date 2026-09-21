const axios = require("axios");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const env = require("../config/env");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const USER_SELECT = "id,displayName,mail,userPrincipalName,accountEnabled";

// Built lazily (and only once credentials are actually present) so the app
// can boot fine with CloudReady unconfigured — every caller must check
// isConfigured() (or handle the thrown error) rather than assuming Entra
// is always available.
let client = null;

function isConfigured() {
  return Boolean(env.cloudready.tenantId && env.cloudready.clientId && env.cloudready.clientSecret);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    client = new ConfidentialClientApplication({
      auth: {
        clientId: env.cloudready.clientId,
        authority: `https://login.microsoftonline.com/${env.cloudready.tenantId}`,
        clientSecret: env.cloudready.clientSecret,
      },
    });
  }
  return client;
}

// Internal only — never returned from a controller or sent to the frontend.
// MSAL caches the token itself, so calling this per-request is cheap.
async function getAccessToken() {
  const cca = getClient();
  if (!cca) throw new Error("CloudReady Entra ID is not configured (missing CLOUDREADY_TENANT_ID/CLIENT_ID/CLIENT_SECRET)");
  const result = await cca.acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] });
  return result.accessToken;
}

function normalizeUser(u) {
  return {
    id: u.id,
    displayName: u.displayName,
    mail: u.mail,
    userPrincipalName: u.userPrincipalName,
    accountEnabled: u.accountEnabled,
  };
}

function escapeODataLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// GET /users, following @odata.nextLink until every page has been read —
// a single request is never assumed to contain the whole directory.
async function listUsers() {
  const token = await getAccessToken();
  let url = `${GRAPH_BASE}/users`;
  let params = { $select: USER_SELECT, $top: 100 };
  const users = [];

  while (url) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    users.push(...data.value.map(normalizeUser));
    url = data["@odata.nextLink"] || null;
    params = undefined; // nextLink already carries the query string
  }

  return users;
}

async function findUserByUserPrincipalName(userPrincipalName) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${GRAPH_BASE}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      $filter: `userPrincipalName eq '${escapeODataLiteral(userPrincipalName)}'`,
      $select: USER_SELECT,
    },
  });
  return data.value[0] ? normalizeUser(data.value[0]) : null;
}

async function findUserById(entraObjectId) {
  const token = await getAccessToken();
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/users/${encodeURIComponent(entraObjectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: USER_SELECT },
    });
    return normalizeUser(data);
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

module.exports = {
  isConfigured,
  getAccessToken,
  listUsers,
  findUserByUserPrincipalName,
  findUserById,
};
