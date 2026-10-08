import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Handle an expired / revoked token centrally.
 *
 * The backend signs access tokens with a finite lifetime
 * (ACCESS_TOKEN_EXPIRE_MINUTES, 1440 = 24h by default). Once it lapses every
 * request returns 401, so instead of surfacing raw "Not authenticated" errors
 * we clear the dead session and send the user to the login screen.
 */
let redirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const isAuthRoute = (error?.config?.url || "").includes("/auth/login");

    if (status === 401 && !isAuthRoute && !redirecting) {
      const token = localStorage.getItem("token");
      // Only act on a session we actually have; a stray 401 from an
      // unauthenticated probe should not trigger a redirect loop.
      if (token) {
        redirecting = true;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?expired=1&next=${back}`;
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;