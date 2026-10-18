import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { apiRequest, getTokens, jsonBody, setTokens } from "./api";

export type User = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  permissions: string[];
  is_superuser?: boolean;
  mfa_enabled?: boolean;
};
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string, code?: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getTokens());
  const [error, setError] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    let active = true;
    if (getTokens()) {
      apiRequest<User>("/accounts/me/")
        .then((value) => {
          if (active) setUser(value);
        })
        .catch((err: Error) => {
          if (active) {
            setTokens(null);
            setError(err.message);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    const expired = () => {
      setUser(null);
      setError("Your session expired. Please sign in again.");
      cache.clear();
    };
    window.addEventListener("session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, [cache]);
  async function login(email: string, password: string, code = "") {
    const tokens = await apiRequest<{ access: string; refresh: string }>(
      "/auth/token/",
      jsonBody({ email, password, code }),
    );
    setTokens(tokens);
    try {
      const current = await apiRequest<User>("/accounts/me/");
      cache.clear();
      setUser(current);
      setError("");
    } catch (err) {
      setTokens(null);
      throw err;
    }
  }
  async function logout() {
    const refresh = getTokens()?.refresh;
    try {
      if (refresh) await apiRequest("/auth/logout/", jsonBody({ refresh }));
    } finally {
      setTokens(null);
      setUser(null);
      cache.clear();
    }
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// This module also exports the hook used by consumers.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}
// eslint-disable-next-line react-refresh/only-export-components
export function can(user: User | null, permission: string) {
  return (
    user?.role === "LEARNER" ||
    !!user?.permissions.includes(`admissions.${permission}`)
  );
}
