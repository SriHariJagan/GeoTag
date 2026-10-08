import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiCheck, FiEye, FiEyeOff, FiLock, FiArrowLeft } from "react-icons/fi";
import { validateResetToken, resetPassword } from "../../../api/auth.api";
import styles from "../AuthFlow.module.css";

const RULES = [
  { key: "len", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { key: "lower", label: "One lowercase letter (a–z)", test: (v) => /[a-z]/.test(v) },
  { key: "upper", label: "One UPPERCASE letter (A–Z)", test: (v) => /[A-Z]/.test(v) },
  { key: "digit", label: "One digit (0–9)", test: (v) => /[0-9]/.test(v) },
];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [masked, setMasked] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setValid(false);
      return;
    }
    validateResetToken(token)
      .then((r) => {
        setValid(Boolean(r.data?.valid));
        setMasked(r.data?.email_masked || "");
      })
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const strong = RULES.every((r) => r.test(pw));
  const match = pw.length > 0 && pw === pw2;
  const canSubmit = valid && !busy && strong && match;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not update the password."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logoMark}>G</span> GeoTech
        </div>
        <h1>Set a new password</h1>
        <p className={styles.sub}>
          {checking
            ? "Checking your reset link…"
            : valid
              ? `Verified${masked ? ` for ${masked}` : ""} — type the new password twice.`
              : "This link is invalid, expired, or already used."}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {!checking && !valid && !done && (
          <>
            <div className={styles.error}>
              Ask for a fresh code on the forgot-password page — links work once
              and expire after 30 minutes.
            </div>
            <button className={styles.primary} onClick={() => navigate("/forgot-password")}>
              Get a new link
            </button>
            <button className={styles.backLink} onClick={() => navigate("/login")}>
              <FiArrowLeft style={{ verticalAlign: "-2px" }} /> Back to login
            </button>
          </>
        )}

        {valid && !done && (
          <form onSubmit={submit} style={{ display: "contents" }}>
            <label className={styles.field}>
              <span>New password *</span>
              <span className={styles.inputWrap}>
                <input
                  type={show1 ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Type the new password"
                  autoComplete="new-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShow1((s) => !s)}
                  aria-label={show1 ? "Hide password" : "Show password"}
                >
                  {show1 ? <FiEyeOff /> : <FiEye />}
                </button>
              </span>
            </label>

            <ul className={styles.checks}>
              {RULES.map((r) => (
                <li key={r.key} data-ok={r.test(pw) ? "1" : undefined}>
                  <FiCheck /> {r.label}
                </li>
              ))}
            </ul>

            <label className={styles.field}>
              <span>Type it again *</span>
              <span className={styles.inputWrap}>
                <input
                  type={show2 ? "text" : "password"}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShow2((s) => !s)}
                  aria-label={show2 ? "Hide password" : "Show password"}
                >
                  {show2 ? <FiEyeOff /> : <FiEye />}
                </button>
              </span>
            </label>
            {pw2.length > 0 && (
              match
                ? <span className={styles.matchOk}><FiCheck style={{ verticalAlign: "-2px" }} /> Passwords match</span>
                : <span className={styles.matchBad}>Passwords don&apos;t match yet</span>
            )}

            <button className={styles.primary} disabled={!canSubmit}>
              <FiLock /> {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {done && (
          <>
            <div className={styles.success}>
              <b>Password updated ✓</b>
              Log in with your new password.
            </div>
            <button className={styles.primary} onClick={() => navigate("/login")}>
              Go to login
            </button>
          </>
        )}
      </div>
    </main>
  );
}
