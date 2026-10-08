import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import styles from "./AcceptInvite.module.css";
import { validateInvitation, acceptInvite } from "../../api/auth.api";

const REQUIREMENTS = [
  "At least 8 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One digit",
];

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing invite link.");
      setChecking(false);
      return;
    }
    validateInvitation(token)
      .then((res) => {
        setPreview(res.data);
        setChecking(false);
      })
      .catch(() => {
        setError("This invitation is invalid, expired, revoked, or already used.");
        setChecking(false);
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await acceptInvite({ token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Invite link is expired or already used."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Accept Invitation</h1>
        <p className={styles.subtitle}>Set your password to activate your account</p>

        {checking && <p className={styles.subtitle}>Validating invitation…</p>}
        {error && <div className={styles.error}>{error}</div>}

        {preview && !done && (
          <div className={styles.preview}>
            <p><b>Name:</b> {preview.full_name}</p>
            <p><b>Email:</b> {preview.email}</p>
            <p><b>Role:</b> {preview.role}</p>
            <p><b>Organization:</b> {preview.organization}</p>
          </div>
        )}

        {!checking && !error && !done && (
          <>
            <ul className={styles.requirements}>
              {REQUIREMENTS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className={styles.field}>
              <label>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                minLength={8}
              />
            </div>
            <div className={styles.field}>
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                minLength={8}
              />
            </div>
            <button type="submit" className={styles.primaryBtn} disabled={loading}>
              {loading ? "Activating..." : "Activate Account"}
            </button>
          </>
        )}

        {done && (
          <div className={styles.success}>
            Account activated. Redirecting to login…
          </div>
        )}
      </form>
    </div>
  );
}
