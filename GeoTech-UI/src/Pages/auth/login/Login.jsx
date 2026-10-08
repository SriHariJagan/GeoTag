import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../store/context/AuthContext";
import { ROLES } from "../../../constants/roles";
import styles from "./Login.module.css";

const ROLE_REDIRECT = {
  [ROLES.SUPERADMIN]: "/admin",
  [ROLES.ADMIN]: "/admin",
  [ROLES.MONITOR]: "/admin",
  [ROLES.SUPERVISOR]: "/supervisor",
  [ROLES.VENDOR]: "/vendor",
};

const Login = () => {
  const navigate = useNavigate();
  const { loginUser } = useAuth();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  /* the axios interceptor strips a lapsed session and sends ?expired=1 */
  const sessionExpired = searchParams.get("expired") === "1";
  const nextPath = searchParams.get("next");

  const handleChange = (e) => {
    if (!loading) {
      setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const user = await loginUser(form);

      const redirectPath = nextPath || ROLE_REDIRECT[user.role];
      if (!redirectPath) throw new Error("Unauthorized role");

      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Invalid email or password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <section className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <div className={styles.logoMark}>G</div>
          <span>GeoTech</span>
        </div>

        <div className={styles.brandContent}>
          <h1>Manage field projects with clarity.</h1>
          <p>
            Track projects, supervisors, vendors, machinery and daily execution
            reports from a clean operational workspace.
          </p>
        </div>

        <div className={styles.brandStats}>
          <div>
            <strong>Projects</strong>
            <span>Track active work</span>
          </div>
          <div>
            <strong>Reports</strong>
            <span>Daily field updates</span>
          </div>
          <div>
            <strong>Assets</strong>
            <span>Vendors & machinery</span>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.loginCard}>
          <div className={styles.cardHeader}>
            <div className={styles.secureIcon}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1>Welcome back</h1>
              <p>Sign in to continue to GeoTech.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {sessionExpired && (
        <div className={styles.notice}>
          Your session expired after 24 hours of inactivity. Please sign in again.
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label>Email</label>
              <div className={styles.inputWrap}>
                <Mail size={18} />
                <input
                  type="email"
                  name="email"
                  placeholder="admin@geotech.com"
                  value={form.email}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Password</label>
              <div className={styles.inputWrap}>
                <Lock size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />

                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.loginBtn} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.spinner}></span>
                  Signing in...
                </>
              ) : (
                "Login"
              )}
            </button>

            <button
              type="button"
              className={styles.forgotLink}
              disabled={loading}
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </button>
          </form>

          <div className={styles.footer}>
            © {new Date().getFullYear()} GeoTech
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;