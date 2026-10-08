import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiMail, FiCheck, FiArrowLeft, FiSend } from "react-icons/fi";
import { forgotPassword, verifyPasswordOtp } from "../../../api/auth.api";
import styles from "../AuthFlow.module.css";

const OTP_LEN = 6;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 email -> 2 code -> 3 link sent
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(Array(OTP_LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const boxRefs = useRef([]);

  const errMsg = (err, fb) =>
    err?.response?.data?.detail || err?.message || fb;

  const startResendCooldown = () => {
    setResendIn(30);
    const t = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError("");
    try {
      await forgotPassword(email.trim());
      setStep(2);
      setDigits(Array(OTP_LEN).fill(""));
      startResendCooldown();
      setTimeout(() => boxRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(errMsg(err, "Could not send the code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((p) => {
      const n = [...p];
      n[i] = d;
      return n;
    });
    if (d && i < OTP_LEN - 1) boxRefs.current[i + 1]?.focus();
  };

  const onKey = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e) => {
    const nums = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (!nums) return;
    e.preventDefault();
    setDigits(nums.split("").concat(Array(OTP_LEN).fill("")).slice(0, OTP_LEN));
    boxRefs.current[Math.min(nums.length, OTP_LEN - 1)]?.focus();
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    const code = digits.join("");
    if (busy || code.length !== OTP_LEN) return;
    setBusy(true);
    setError("");
    try {
      await verifyPasswordOtp(email.trim(), code);
      setStep(3);
    } catch (err) {
      setError(errMsg(err, "Wrong code. Check and try again."));
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
        <h1>Forgot password?</h1>
        <p className={styles.sub}>
          {step === 1 && "Enter your registered email — we'll send a verification code."}
          {step === 2 && `Enter the 6-digit code sent to ${email}.`}
          {step === 3 && "Code verified — a one-time reset link is on its way to your email."}
        </p>

        <div className={styles.steps}>
          {["Email", "Code", "Reset"].map((label, i) => (
            <span
              key={label}
              className={styles.step}
              data-on={step === i + 1 ? "1" : undefined}
              data-done={step > i + 1 ? "1" : undefined}
            >
              <i>{step > i + 1 ? <FiCheck /> : i + 1}</i> {label}
            </span>
          ))}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {step === 1 && (
          <form onSubmit={sendCode} style={{ display: "contents" }}>
            <label className={styles.field}>
              <span>Registered email *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </label>
            <button className={styles.primary} disabled={busy || !email.trim()}>
              <FiMail /> {busy ? "Sending…" : "Send verification code"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyCode} style={{ display: "contents" }}>
            <div className={styles.otpRow} onPaste={onPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (boxRefs.current[i] = el)}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={`Digit ${i + 1}`}
                  maxLength={1}
                />
              ))}
            </div>
            <button
              className={styles.primary}
              disabled={busy || digits.join("").length !== OTP_LEN}
            >
              <FiCheck /> {busy ? "Verifying…" : "Verify code"}
            </button>
            <button
              type="button"
              className={styles.resend}
              disabled={busy || resendIn > 0}
              onClick={sendCode}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't get it? Resend code"}
            </button>
            <button type="button" className={styles.ghost} onClick={() => setStep(1)}>
              Change email
            </button>
          </form>
        )}

        {step === 3 && (
          <>
            <div className={styles.success}>
              <b>Check your email ✉️</b>
              Open the reset link (valid 30 minutes, one-time use) to choose a
              new password for {email}.
            </div>
            <button className={styles.primary} onClick={() => navigate("/login")}>
              Back to login
            </button>
          </>
        )}

        {step !== 3 && (
          <button className={styles.backLink} onClick={() => navigate("/login")}>
            <FiArrowLeft style={{ verticalAlign: "-2px" }} /> Back to login
          </button>
        )}
      </div>
    </main>
  );
}
