import axios from "axios";
 
const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
 
// The access token is held in memory only (never localStorage) to limit
// exposure if the app were ever vulnerable to XSS. The refresh token lives
// in an httpOnly cookie the browser manages automatically — see
// server/src/controllers/auth.controller.js.
let accessToken = null;
let onUnauthorized = () => {};
let idleLogout = false;
 
export function setIdleLogout(value) {
  idleLogout = value;
}
 
export function setAccessToken(token) {
  accessToken = token;
}
 
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}
 
const api = axios.create({ baseURL, withCredentials: true });
 
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
 
let refreshPromise = null;
 
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = config?.url?.includes("/auth/login") || config?.url?.includes("/auth/refresh");
 
   if (response?.status === 401 &&
    !config._retry &&
    !isAuthRoute &&
    !idleLogout
  ) {
      config._retry = true;
      try {
        // Coalesce concurrent 401s into a single refresh request.
        refreshPromise = refreshPromise || api.post("/auth/refresh");
        const { data } = await refreshPromise;
        refreshPromise = null;
        setAccessToken(data.data.accessToken);
        config.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(config);
      } catch (refreshError) {
        refreshPromise = null;
        setAccessToken(null);
        onUnauthorized();
        return Promise.reject(refreshError);
      }
    }
 
    return Promise.reject(error);
  }
);
 
export default api;