import { createContext, useContext, useEffect, useState } from "react";
import { authLogin, login as legacyLogin } from "../../api/auth.api";
import { decodeToken } from "../../utils/jwt";
import { normalizeRole } from "../../constants/permissions";

const AuthContext = createContext(null);

// Authentication state only. User/profile list data lives in UserContext.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🚪 Logout (declared before effects that use it)
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  // 🔁 Restore session
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return;
    }

    const decoded = decodeToken(token);

    if (!decoded || decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
    } else {
      setUser({
        id: decoded.user_id,
        email: decoded.email,
        role: normalizeRole(decoded.role),
      });
    }

    setLoading(false);
  }, []);

  // 🔐 Login — tries canonical /auth/login, falls back to legacy /users/login
  const loginUser = async (credentials) => {
    let res;
    try {
      res = await authLogin(credentials);
    } catch (err) {
      if (err?.response?.status === 404) {
        res = await legacyLogin(credentials);
      } else {
        throw err;
      }
    }
    const { access_token } = res.data;

    const decoded = decodeToken(access_token);
    if (!decoded) throw new Error("Invalid token received");

    const userData = {
      id: decoded.user_id,
      email: decoded.email,
      role: normalizeRole(decoded.role),
    };

    localStorage.setItem("token", access_token);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    return userData; // 🔥 important
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isAuthenticated: Boolean(user),
        loading,
        loginUser,
        logout,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
