import smtplib
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from app.core.config import settings


def _format_from() -> str:
    """Return a well-formed From header without double-wrapping.

    Accepts either `name <addr>` or a bare address in MAIL_FROM.
    """
    raw = (settings.MAIL_FROM or "").strip()
    name, addr = parseaddr(raw)
    if not addr:
        # Fallback to username if misconfigured (never crash invite flow on format)
        addr = (settings.MAIL_USERNAME or "").strip()
    display = name or "GeoTech Team"
    if addr and "@" in addr:
        return formataddr((display, addr))
    return formataddr(("GeoTech Team", "noreply@geotech.com"))


def build_invite_email(to_email: str, invite_link: str, *, full_name: str = "", role: str = "", organization: str = "") -> EmailMessage:
    org = (organization or settings.ORGANIZATION_NAME or "GeoTech").strip()
    role_label = (role or "").strip().upper() or "Team Member"
    name_line = f"<p style=\"font-size:15px;\">Hi <b>{full_name}</b>,</p>" if full_name else ""
    msg = EmailMessage()

    msg["Subject"] = f"You're invited to join {org}"
    msg["From"] = _format_from()
    msg["To"] = to_email.strip()

    # -------------------------
    # Plain text fallback
    # -------------------------
    msg.set_content(f"""
Welcome to {org}!

You have been invited to join the GeoTech platform.

Name: {full_name or to_email}
Organization: {org}
Role: {role_label}

Please open the link below to activate your account:
{invite_link}

This invitation link will expire in 24 hours. No password is included in this email.

If you did not expect this invitation, you can safely ignore this email.

- {org} Team
""")

    # -------------------------
    # HTML Email (Primary)
    # -------------------------
    msg.add_alternative(f"""
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>GeoTech Invitation</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f7f9fc; font-family:Arial, sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
      <tr>
        <td align="center">

          <table width="100%" cellpadding="0" cellspacing="0" 
                 style="max-width:600px; background:#ffffff; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="padding:24px 32px; background:#2563eb; border-radius:12px 12px 0 0;">
                <h1 style="margin:0; color:#ffffff; font-size:22px;">
                  Welcome to {org}
                </h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:32px; color:#1a1f25;">

                <h2 style="margin-top:0; color:#184096;">
                  You have been invited 🎉
                </h2>

                {name_line}

                <p style="font-size:15px; line-height:1.6;">
                  You have been invited to join the <b>{org}</b> GeoTech platform.
                </p>

                <table style="font-size:14px; color:#1a1f25; margin:16px 0;">
                  <tr><td style="color:#6b7280; padding-right:12px;">Organization</td><td><b>{org}</b></td></tr>
                  <tr><td style="color:#6b7280; padding-right:12px;">Role</td><td><b>{role_label}</b></td></tr>
                </table>

                <p style="font-size:15px; line-height:1.6;">
                  Click the button below to activate your account and set your password.
                </p>

                <!-- CTA Button -->
                <div style="text-align:center; margin:32px 0;">
                  <a href="{invite_link}"
                     style="
                       background:#2563eb;
                       color:#ffffff;
                       padding:14px 28px;
                       text-decoration:none;
                       border-radius:8px;
                       font-weight:600;
                       display:inline-block;
                       font-size:15px;
                     ">
                    Accept Invitation
                  </a>
                </div>

                <p style="font-size:14px; color:#6b7280;">
                  This invitation link will expire in <b>24 hours</b>.
                </p>

                <p style="font-size:14px; color:#6b7280;">
                  If you were not expecting this invitation, you can safely ignore this email.
                </p>

                <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />

                <p style="font-size:13px; color:#9ca3af;">
                  © {org} • Secure Access System
                </p>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>
""", subtype="html")
    return msg


def _deliver(msg: EmailMessage) -> None:
    """Blocking SMTP delivery (isolated for BackgroundTasks / future queue)."""
    with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT) as server:
        server.starttls()
        if settings.MAIL_USERNAME and settings.MAIL_PASSWORD:
            server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
        server.send_message(msg)


def send_invite_email(to_email: str, invite_link: str, *, full_name: str = "", role: str = "", organization: str = "", background=None) -> None:
    """Build + deliver the invitation email.

    Pass a FastAPI `BackgroundTasks` instance as `background` to send
    off the request path. Without it, delivery is synchronous (legacy).
    Swap `_deliver` for a Celery/BullMQ task later without touching callers.
    """
    msg = build_invite_email(
        to_email, invite_link,
        full_name=full_name, role=role, organization=organization,
    )
    if background is not None:
        background.add_task(_deliver, msg)
        return
    _deliver(msg)


def build_otp_email(to_email: str, otp: str, *, full_name: str = "") -> EmailMessage:
    """6-digit verification code for the forgot-password flow (10 minutes)."""
    org = (settings.ORGANIZATION_NAME or "GeoTech").strip()
    msg = EmailMessage()
    msg["Subject"] = f"{org} password reset code: {otp}"
    msg["From"] = _format_from()
    msg["To"] = to_email.strip()
    msg.set_content(f"""
Hi {full_name or to_email},

You asked to reset your GeoTech password.

Your verification code is: {otp}

Enter it on the password-reset page. It expires in 10 minutes and stops
working after 5 wrong attempts.

If you did not ask for this, just ignore this email — your password stays unchanged.

- {org} Team
""")
    msg.add_alternative(f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#f7f9fc;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
<tr><td style="padding:24px 32px;background:#2563eb;border-radius:12px 12px 0 0;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">Reset your password</h1></td></tr>
<tr><td style="padding:32px;color:#1a1f25;">
<p style="font-size:15px;">Hi <b>{full_name or to_email}</b>,</p>
<p style="font-size:15px;">Use this code on the password-reset page:</p>
<div style="text-align:center;margin:28px 0;">
<span style="font-size:38px;font-weight:800;letter-spacing:12px;color:#1d4ed8;">{otp}</span>
</div>
<p style="font-size:14px;color:#6b7280;">Expires in <b>10 minutes</b>. After verifying, we'll email you a one-time reset link.</p>
<p style="font-size:14px;color:#6b7280;">Didn't ask for this? Ignore it — your password stays unchanged.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
<p style="font-size:13px;color:#9ca3af;">© {org} • Secure Access System</p>
</td></tr></table></td></tr></table></body></html>
""", subtype="html")
    return msg


def build_reset_link_email(to_email: str, reset_link: str, *, full_name: str = "") -> EmailMessage:
    """One-time reset link, sent after the OTP is verified (30 minutes)."""
    org = (settings.ORGANIZATION_NAME or "GeoTech").strip()
    msg = EmailMessage()
    msg["Subject"] = f"{org}: set a new password"
    msg["From"] = _format_from()
    msg["To"] = to_email.strip()
    msg.set_content(f"""
Hi {full_name or to_email},

Your code was verified. Open the link below to set a new GeoTech password:

{reset_link}

The link works once and expires in 30 minutes.

If you did not ask for this, just ignore this email.

- {org} Team
""")
    msg.add_alternative(f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#f7f9fc;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
<tr><td style="padding:24px 32px;background:#2563eb;border-radius:12px 12px 0 0;">
<h1 style="margin:0;color:#ffffff;font-size:22px;">Choose a new password</h1></td></tr>
<tr><td style="padding:32px;color:#1a1f25;">
<p style="font-size:15px;">Hi <b>{full_name or to_email}</b>,</p>
<p style="font-size:15px;">Your code is verified. Click below to set a new password:</p>
<div style="text-align:center;margin:28px 0;">
<a href="{reset_link}" style="background:#2563eb;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;font-size:15px;">Set new password</a>
</div>
<p style="font-size:14px;color:#6b7280;">One-time link, expires in <b>30 minutes</b>.</p>
<p style="font-size:14px;color:#6b7280;">Didn't ask for this? Ignore it.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
<p style="font-size:13px;color:#9ca3af;">© {org} • Secure Access System</p>
</td></tr></table></td></tr></table></body></html>
""", subtype="html")
    return msg


def send_otp_email(to_email: str, otp: str, *, full_name: str = "", background=None) -> None:
    msg = build_otp_email(to_email, otp, full_name=full_name)
    if background is not None:
        background.add_task(_deliver, msg)
        return
    _deliver(msg)


def send_reset_link_email(to_email: str, reset_link: str, *, full_name: str = "", background=None) -> None:
    msg = build_reset_link_email(to_email, reset_link, full_name=full_name)
    if background is not None:
        background.add_task(_deliver, msg)
        return
    _deliver(msg)
