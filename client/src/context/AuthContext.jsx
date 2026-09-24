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

const IDLE_TIMEOUT_MS = 10* 60 * 1000;

export function AuthProvider({ children }) {
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const idleLoggedOutRef = useRef(false);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const handleIdleLogout = useCallback(async () => {
    if (idleLoggedOutRef.current) return;

    idleLoggedOutRef.current = true;

    sessionStorage.setItem("idleLogout", "true");
    setIdleLogout(true);

    // Clear the local session immediately.
    clearSession();

    try {
      // Revoke the refresh token on the server.
      await authApi.logout();
    } catch {
      // Even if server logout fails, local session is already cleared.
    } finally {
      // Return to login after logout attempt completes.
      window.location.href = "/login?reason=idle";
    }
  }, [clearSession]);

  const checkIdleTimeout = useCallback(() => {
    if (!user || idleLoggedOutRef.current) return;

    const inactiveFor = Date.now() - lastActivityRef.current;

    if (inactiveFor >= IDLE_TIMEOUT_MS) {
      handleIdleLogout();
      return;
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      checkIdleTimeout();
    }, IDLE_TIMEOUT_MS - inactiveFor);
  }, [user, handleIdleLogout]);

  const recordActivity = useCallback(() => {
    if (!user || idleLoggedOutRef.current) return;

    const inactiveFor = Date.now() - lastActivityRef.current;

    // Do not reset the timer if the user was already idle
    // for the full timeout period.
    if (inactiveFor >= IDLE_TIMEOUT_MS) {
      handleIdleLogout();
      return;
    }

    lastActivityRef.current = Date.now();

    checkIdleTimeout();
  }, [user, handleIdleLogout, checkIdleTimeout]);

  // Initial session restoration.
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

        // Start idle tracking from the time the session is restored.
        lastActivityRef.current = Date.now();
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [clearSession]);

  // Track application activity and enforce idle timeout.
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

    activityEvents.forEach((event) => {
      window.addEventListener(event, recordActivity, {
        passive: true,
      });
    });

    // Check when the user returns to the Solvora tab/window.
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        checkIdleTimeout();
      }
    };

    // Check when the browser window becomes active again.
    const checkWhenFocused = () => {
      checkIdleTimeout();
    };

    // Check when the page becomes visible again after
    // being minimized/backgrounded.
    const checkWhenPageShown = () => {
      checkIdleTimeout();
    };

    document.addEventListener(
      "visibilitychange",
      checkWhenVisible
    );

    window.addEventListener("focus", checkWhenFocused);
    window.addEventListener("pageshow", checkWhenPageShown);

    // Start the timeout.
    checkIdleTimeout();

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordActivity);
      });

      document.removeEventListener(
        "visibilitychange",
        checkWhenVisible
      );

      window.removeEventListener("focus", checkWhenFocused);
      window.removeEventListener("pageshow", checkWhenPageShown);

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [user, recordActivity, checkIdleTimeout]);

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