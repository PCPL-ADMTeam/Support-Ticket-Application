import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
 
import { authApi } from "../api/auth";
 
import {
  setAccessToken,
  setUnauthorizedHandler,
  setIdleLogout,
} from "../api/axios";
 
const AuthContext = createContext(null);
 
export function AuthProvider({ children }) {
  const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
 
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const idleLoggedOutRef = useRef(false);
 
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
 
  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);
 
  // Automatic logout after the user has been inactive
  // for the configured idle timeout.
  const handleIdleLogout = useCallback(async () => {
    if (idleLoggedOutRef.current) return;
 
    idleLoggedOutRef.current = true;
 
    sessionStorage.setItem("idleLogout", "true");
    setIdleLogout(true);
 
    try {
      await authApi.logout();
    } catch {
      // Even if server logout fails, clear the local session.
    } finally {
      clearSession();
      window.location.href = "/login?reason=idle";
    }
  }, [clearSession]);
 
  // Reset the inactivity timer whenever the user performs activity.
  const resetIdleTimer = useCallback(() => {
    if (!user || idleLoggedOutRef.current) return;
 
    lastActivityRef.current = Date.now();
 
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
 
    idleTimerRef.current = setTimeout(() => {
      const inactiveFor = Date.now() - lastActivityRef.current;
 
      if (inactiveFor >= IDLE_TIMEOUT_MS) {
        handleIdleLogout();
      } else {
        resetIdleTimer();
      }
    }, IDLE_TIMEOUT_MS);
  }, [user, handleIdleLogout]);
 
  // On first load, try to silently resume a session using
  // the httpOnly refresh cookie.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
 
    const idleLogout = sessionStorage.getItem("idleLogout");
 
    if (idleLogout === "true") {
      sessionStorage.removeItem("idleLogout");
      clearSession();
      setLoading(false);
      return;
    }
 
    (async () => {
      try {
        const { data } = await authApi.refresh();
 
        setIdleLogout(false);
        setAccessToken(data.data.accessToken);
        setUser(data.data.user);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [clearSession]);
 
  // Track user activity and enforce the idle timeout.
  useEffect(() => {
    if (!user || idleLoggedOutRef.current) return;
 
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
 
    const handleActivity = () => {
      resetIdleTimer();
    };
 
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, {
        passive: true,
      });
    });
 
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const inactiveFor = Date.now() - lastActivityRef.current;
 
        if (inactiveFor >= IDLE_TIMEOUT_MS) {
          handleIdleLogout();
        } else {
          resetIdleTimer();
        }
      }
    };
 
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
 
    resetIdleTimer();
 
    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
 
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
 
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [user, resetIdleTimer, handleIdleLogout]);
 
  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login(email, password);
 
    sessionStorage.removeItem("idleLogout");
 
    idleLoggedOutRef.current = false;
    lastActivityRef.current = Date.now();
 
    setIdleLogout(false);
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
 
    return data.data.user;
  }, []);
 
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      sessionStorage.removeItem("idleLogout");
      idleLoggedOutRef.current = false;
 
      setIdleLogout(false);
      clearSession();
    }
  }, [clearSession]);
 
  const refreshMe = useCallback(async () => {
    const { data } = await authApi.me();
 
    setUser(data.data);
 
    return data.data;
  }, []);
 
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshMe,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
 
export function useAuth() {
  const ctx = useContext(AuthContext);
 
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
 
  return ctx;
}