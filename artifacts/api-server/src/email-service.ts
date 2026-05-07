import nodemailer from "nodemailer";

function createTransporter() {
  const login = process.env.BREVO_SMTP_LOGIN;
  const pass = process.env.BREVO_SMTP_PASS;
  if (!login || !pass) return null;

  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: { user: login, pass },
  });
}

const SENDER = process.env.BREVO_SENDER || "priyanshupanwar369@gmail.com";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PASSWORD_LENGTH = 8;
const OTP_VALIDITY_MINUTES = 10;
const DEFAULT_SMS_PROVIDER = "android_gateway";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIstDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Not scheduled";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

export function generatePassword(length = DEFAULT_PASSWORD_LENGTH): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * PASSWORD_ALPHABET.length);
    password += PASSWORD_ALPHABET[idx] ?? "A";
  }
  return password;
}

// Backward-compatible export name used in older route imports.
export function generateOtp(): string {
  return generatePassword();
}

export function generateLoginOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeMobileForSms(mobile: string): string {
  const trimmed = mobile.trim();
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
}

function getSmsProvider(): string {
  const configured = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  if (process.env.SMS_GATEWAY_URL?.trim()) return "android_gateway";
  return DEFAULT_SMS_PROVIDER;
}

async function sendVoterLoginOtpSmsViaAndroidGateway(opts: {
  mobile: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const gatewayUrl = process.env.SMS_GATEWAY_URL?.trim();
  if (!gatewayUrl) {
    return { sent: false, error: "Android SMS gateway URL is not configured" };
  }

  const method = (process.env.SMS_GATEWAY_METHOD || "POST").trim().toUpperCase();
  const toField = (process.env.SMS_GATEWAY_TO_FIELD || "to").trim();
  const messageField = (process.env.SMS_GATEWAY_MESSAGE_FIELD || "message").trim();
  const tokenField = (process.env.SMS_GATEWAY_TOKEN_FIELD || "").trim();
  const authToken = process.env.SMS_GATEWAY_AUTH_TOKEN?.trim();
  const authHeader = (process.env.SMS_GATEWAY_AUTH_HEADER || "Authorization").trim();
  const authScheme = (process.env.SMS_GATEWAY_AUTH_SCHEME || "Bearer").trim();

  const to = normalizeMobileForSms(opts.mobile);
  const message = `BlockVotes OTP for ${opts.electionName}: ${opts.otp}. Valid for ${OTP_VALIDITY_MINUTES} minutes.`;

  try {
    const payload: Record<string, string> = {
      [toField]: to,
      [messageField]: message,
      otp: opts.otp,
      election_name: opts.electionName,
      voter_name: opts.voterName,
    };

    const headers: Record<string, string> = {};
    if (authToken && authHeader && !tokenField) {
      headers[authHeader] = authScheme ? `${authScheme} ${authToken}` : authToken;
    }

    if (method === "GET") {
      const url = new URL(gatewayUrl);
      const params = new URLSearchParams(url.search);
      for (const [key, value] of Object.entries(payload)) {
        params.set(key, value);
      }
      if (authToken && tokenField) {
        params.set(tokenField, authToken);
      }
      url.search = params.toString();

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const text = await response.text();
        return { sent: false, error: `Gateway error: ${text || response.statusText}` };
      }
      return { sent: true };
    }

    if (authToken && tokenField) {
      payload[tokenField] = authToken;
    }

    headers["Content-Type"] = "application/json";
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return { sent: false, error: `Gateway error: ${text || response.statusText}` };
    }

    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err?.message || "Failed to send SMS via Android gateway" };
  }
}

async function sendVoterLoginOtpSmsViaTwilio(opts: {
  mobile: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { sent: false, error: "Twilio SMS is not configured" };
  }

  const to = normalizeMobileForSms(opts.mobile);
  const body = `BlockVotes OTP for ${opts.electionName}: ${opts.otp}. Valid for ${OTP_VALIDITY_MINUTES} minutes.`;
  const params = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body,
  });

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return { sent: false, error: `Twilio error: ${text || response.statusText}` };
    }

    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err?.message || "Failed to send SMS OTP" };
  }
}

async function sendVoterLoginOtpSmsViaSmsMobileApi(opts: {
  mobile: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.SMSMOBILEAPI_APIKEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "SMSMOBILEAPI_APIKEY is not configured" };
  }

  const endpoint = process.env.SMSMOBILEAPI_ENDPOINT?.trim() || "https://api.smsmobileapi.com/sendsms/";
  const recipients = normalizeMobileForSms(opts.mobile);
  const message = `BlockVotes OTP for ${opts.electionName}: ${opts.otp}. Valid for ${OTP_VALIDITY_MINUTES} minutes.`;

  try {
    const url = new URL(endpoint);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("recipients", recipients);
    url.searchParams.set("message", message);

    const simPort = process.env.SMSMOBILEAPI_PORT?.trim();
    if (simPort) {
      url.searchParams.set("port", simPort);
    }

    const sIdentifiant = process.env.SMSMOBILEAPI_SIDENTIFIANT?.trim();
    if (sIdentifiant) {
      url.searchParams.set("sIdentifiant", sIdentifiant);
    }

    const response = await fetch(url.toString(), { method: "GET" });
    const raw = await response.text();

    if (!response.ok) {
      return { sent: false, error: `SmsMobileApi error: ${raw || response.statusText}` };
    }

    try {
      const parsed = JSON.parse(raw) as { result?: { error?: string | number; sent?: string | number } };
      const errCode = parsed?.result?.error;
      if (errCode !== undefined && String(errCode) !== "0") {
        return { sent: false, error: `SmsMobileApi result error code: ${String(errCode)}` };
      }

      const sent = parsed?.result?.sent;
      if (sent !== undefined && String(sent) !== "1") {
        return { sent: false, error: `SmsMobileApi did not confirm sent=1 (got ${String(sent)})` };
      }
    } catch {
      // Some gateway responses may not be strict JSON; HTTP success is treated as accepted.
    }

    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err?.message || "Failed to send SMS via SmsMobileApi" };
  }
}

async function sendVoterLoginOtpEmail(opts: {
  to: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, error: "Brevo SMTP not configured" };

  const voterName = escapeHtml(opts.voterName);
  const electionName = escapeHtml(opts.electionName);
  const otp = escapeHtml(opts.otp);
  const validity = `${OTP_VALIDITY_MINUTES} minutes`;

  const html = `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;background:linear-gradient(135deg,#0f172a,#1e293b);text-align:center;">
        <h1 style="margin:0;color:#e2e8f0;font-size:24px;">BlockVotes</h1>
        <p style="margin:8px 0 0;color:#93c5fd;font-size:12px;letter-spacing:0.8px;text-transform:uppercase;">Voter Login Verification</p>
      </div>
      <div style="padding:24px 26px;">
        <p style="margin:0 0 8px;font-size:15px;color:#0f172a;">Dear <strong>${voterName}</strong>,</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
          Use the OTP below to complete your login for <strong>${electionName}</strong>.
        </p>
        <div style="padding:14px 16px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;margin-bottom:14px;">
          <p style="margin:0 0 8px;color:#1e3a8a;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">One-Time Password</p>
          <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:32px;letter-spacing:8px;color:#1d4ed8;font-weight:700;text-align:center;">${otp}</p>
        </div>
        <p style="margin:0;color:#64748b;font-size:12px;">This OTP expires in ${validity}. Do not share it with anyone.</p>
      </div>
      <div style="padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">Automated security message from BlockVotes.</p>
      </div>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${SENDER}>`,
      to: opts.to,
      subject: `Your BlockVotes Login OTP - ${opts.electionName}`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

async function sendVoterLoginOtpSms(opts: {
  mobile: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const provider = getSmsProvider();

  if (provider === "android_gateway") {
    return sendVoterLoginOtpSmsViaAndroidGateway(opts);
  }

  if (provider === "twilio") {
    return sendVoterLoginOtpSmsViaTwilio(opts);
  }

  if (provider === "smsmobileapi") {
    return sendVoterLoginOtpSmsViaSmsMobileApi(opts);
  }

  return {
    sent: false,
    error: `Unsupported SMS_PROVIDER "${provider}". Use "android_gateway", "smsmobileapi", or "twilio".`,
  };
}

export async function sendVoterLoginOtpDelivery(opts: {
  to: string;
  mobile: string;
  voterName: string;
  electionName: string;
  otp: string;
}): Promise<{
  sent: boolean;
  email_sent: boolean;
  sms_sent: boolean;
  error?: string;
}> {
  const [emailResult, smsResult] = await Promise.all([
    sendVoterLoginOtpEmail({
      to: opts.to,
      voterName: opts.voterName,
      electionName: opts.electionName,
      otp: opts.otp,
    }),
    sendVoterLoginOtpSms({
      mobile: opts.mobile,
      voterName: opts.voterName,
      electionName: opts.electionName,
      otp: opts.otp,
    }),
  ]);

  if (emailResult.sent && smsResult.sent) {
    return {
      sent: true,
      email_sent: true,
      sms_sent: true,
    };
  }

  if (emailResult.sent || smsResult.sent) {
    return {
      sent: true,
      email_sent: emailResult.sent,
      sms_sent: smsResult.sent,
      error: !smsResult.sent
        ? smsResult.error
        : !emailResult.sent
          ? emailResult.error
          : undefined,
    };
  }

  const errors: string[] = [];
  if (!emailResult.sent && emailResult.error) errors.push(`email: ${emailResult.error}`);
  if (!smsResult.sent && smsResult.error) errors.push(`sms: ${smsResult.error}`);

  return {
    sent: false,
    email_sent: emailResult.sent,
    sms_sent: smsResult.sent,
    error: errors.join(" | ") || "OTP delivery failed",
  };
}

export async function sendVoterCredentials(opts: {
  to: string;
  voterName: string;
  electionName: string;
  electionId: string;
  password: string;
  electionStartAt?: Date | string | null;
  electionEndAt?: Date | string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, error: "Brevo SMTP not configured" };

  const loginUrl = `${process.env.APP_URL || "http://localhost:5173"}/voter/login`;
  const voterName = escapeHtml(opts.voterName);
  const electionName = escapeHtml(opts.electionName);
  const electionId = escapeHtml(opts.electionId);
  const email = escapeHtml(opts.to);
  const password = escapeHtml(opts.password);
  const loginUrlEscaped = escapeHtml(loginUrl);
  const electionStartIst = escapeHtml(formatIstDateTime(opts.electionStartAt ?? null));
  const electionEndIst = escapeHtml(formatIstDateTime(opts.electionEndAt ?? null));
  const profileDeadlineText =
    (opts.electionStartAt ?? null) !== null
      ? `Update your profile before ${electionStartIst} (IST); otherwise you will not be eligible to vote.`
      : "Update your profile before election start; otherwise you will not be eligible to vote.";
  const profileDeadlineEscaped = escapeHtml(profileDeadlineText);
  const issuedAtIst = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  const html = `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 28px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);text-align:center;">
        <h1 style="margin:0;font-size:28px;line-height:1.2;color:#e2e8f0;letter-spacing:0.4px;">BlockVotes</h1>
        <p style="margin:8px 0 0;color:#93c5fd;font-size:13px;letter-spacing:0.8px;text-transform:uppercase;">Secure Digital Election Platform</p>
      </div>

      <div style="padding:28px;">
        <p style="margin:0 0 10px;color:#0f172a;font-size:16px;">Dear <strong>${voterName}</strong>,</p>
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          You have been successfully registered as a voter for <strong>${electionName}</strong>.
          Please use the credentials below to access the voter portal.
        </p>

        <div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;">
          <p style="margin:0;color:#1e3a8a;font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Credential Summary</p>
          <p style="margin:8px 0 0;color:#1e40af;font-size:14px;">Issued on: ${issuedAtIst} (IST)</p>
        </div>

        <div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0;color:#334155;font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Election Schedule (IST)</p>
          <p style="margin:8px 0 0;color:#0f172a;font-size:14px;"><strong>Starts:</strong> ${electionStartIst}</p>
          <p style="margin:6px 0 0;color:#0f172a;font-size:14px;"><strong>Ends:</strong> ${electionEndIst}</p>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
          <tr>
            <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px 10px 0 0;">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Election ID</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:15px;color:#0f172a;font-weight:700;word-break:break-all;">${electionId}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Registered Email</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:14px;color:#0f172a;word-break:break-all;">${email}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px;background:#0f172a;border:1px solid #0f172a;border-top:none;border-radius:0 0 10px 10px;text-align:center;">
              <p style="margin:0 0 8px;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Password</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:30px;line-height:1.1;letter-spacing:6px;color:#22c55e;font-weight:700;">${password}</p>
            </td>
          </tr>
        </table>

        <a href="${loginUrlEscaped}" style="display:block;text-align:center;text-decoration:none;background:#2563eb;color:#ffffff;padding:13px 20px;border-radius:10px;font-size:15px;font-weight:700;">
          Open Voter Portal
        </a>

        <div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
            For security, do not share this password with anyone. Election administrators and support staff will never ask for your password.
          </p>
          <p style="margin:10px 0 0;color:#b45309;font-size:13px;line-height:1.6;font-weight:600;">
            ${profileDeadlineEscaped}
          </p>
        </div>

        <p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.6;">
          If you did not expect this email, please contact your election administrator immediately.
        </p>
      </div>

      <div style="padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated service email from BlockVotes.</p>
      </div>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${SENDER}>`,
      to: opts.to,
      subject: `Your BlockVotes Voter Login Credentials - ${opts.electionName}`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendVoterPasswordUpdatedNotice(opts: {
  to: string;
  voterName: string;
  electionName: string;
  electionId: string;
  password: string;
  reportUrl: string;
  electionStartAt?: Date | string | null;
  electionEndAt?: Date | string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, error: "Brevo SMTP not configured" };

  const loginUrl = `${process.env.APP_URL || "http://localhost:5173"}/voter/login`;
  const voterName = escapeHtml(opts.voterName);
  const electionName = escapeHtml(opts.electionName);
  const electionId = escapeHtml(opts.electionId);
  const email = escapeHtml(opts.to);
  const password = escapeHtml(opts.password);
  const loginUrlEscaped = escapeHtml(loginUrl);
  const reportUrlEscaped = escapeHtml(opts.reportUrl);
  const electionStartIst = escapeHtml(formatIstDateTime(opts.electionStartAt ?? null));
  const electionEndIst = escapeHtml(formatIstDateTime(opts.electionEndAt ?? null));
  const profileDeadlineText =
    (opts.electionStartAt ?? null) !== null
      ? `Update your profile before ${electionStartIst} (IST); otherwise you will not be eligible to vote.`
      : "Update your profile before election start; otherwise you will not be eligible to vote.";
  const profileDeadlineEscaped = escapeHtml(profileDeadlineText);
  const issuedAtIst = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  const html = `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 28px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);text-align:center;">
        <h1 style="margin:0;font-size:28px;line-height:1.2;color:#e2e8f0;letter-spacing:0.4px;">BlockVotes</h1>
        <p style="margin:8px 0 0;color:#93c5fd;font-size:13px;letter-spacing:0.8px;text-transform:uppercase;">Password Update Security Notice</p>
      </div>

      <div style="padding:28px;">
        <p style="margin:0 0 10px;color:#0f172a;font-size:16px;">Dear <strong>${voterName}</strong>,</p>
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          Your voter account password has been updated for <strong>${electionName}</strong>.
          Use the updated credentials below to log in.
        </p>

        <div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;">
          <p style="margin:0;color:#1e3a8a;font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Update Summary</p>
          <p style="margin:8px 0 0;color:#1e40af;font-size:14px;">Updated on: ${issuedAtIst} (IST)</p>
        </div>

        <div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0;color:#334155;font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Election Schedule (IST)</p>
          <p style="margin:8px 0 0;color:#0f172a;font-size:14px;"><strong>Starts:</strong> ${electionStartIst}</p>
          <p style="margin:6px 0 0;color:#0f172a;font-size:14px;"><strong>Ends:</strong> ${electionEndIst}</p>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
          <tr>
            <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px 10px 0 0;">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Election ID</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:15px;color:#0f172a;font-weight:700;word-break:break-all;">${electionId}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Registered Email</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:14px;color:#0f172a;word-break:break-all;">${email}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px;background:#0f172a;border:1px solid #0f172a;border-top:none;border-radius:0 0 10px 10px;text-align:center;">
              <p style="margin:0 0 8px;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Updated Password</p>
              <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:30px;line-height:1.1;letter-spacing:6px;color:#22c55e;font-weight:700;">${password}</p>
            </td>
          </tr>
        </table>

        <a href="${loginUrlEscaped}" style="display:block;text-align:center;text-decoration:none;background:#2563eb;color:#ffffff;padding:13px 20px;border-radius:10px;font-size:15px;font-weight:700;">
          Open Voter Portal
        </a>

        <div style="margin-top:18px;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
          <p style="margin:0 0 10px;color:#b45309;font-size:13px;line-height:1.6;font-weight:600;">
            ${profileDeadlineEscaped}
          </p>
          <p style="margin:0 0 10px;color:#9a3412;font-size:13px;line-height:1.6;">
            If you did not request this password change, report it immediately. We will renew your password and send fresh credentials.
          </p>
          <a href="${reportUrlEscaped}" style="display:inline-block;text-decoration:none;background:#dc2626;color:#ffffff;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:700;">
            Report Unauthorized Password Change
          </a>
        </div>
      </div>

      <div style="padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated security email from BlockVotes.</p>
      </div>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${SENDER}>`,
      to: opts.to,
      subject: `Security Alert: Password Updated - ${opts.electionName}`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendCandidateConfirmation(opts: {
  to: string;
  candidateName: string;
  electionName: string;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, error: "Brevo SMTP not configured" };

  const candidateName = escapeHtml(opts.candidateName);
  const electionName = escapeHtml(opts.electionName);

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px 24px;">
    <div style="background:#0f172a;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#38bdf8;font-size:28px;margin:0;">BlockVotes</h1>
      <p style="color:#94a3b8;margin:8px 0 0;">Secure Blockchain Voting System</p>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <p style="color:#475569;font-size:16px;margin:0 0 8px;">Hello, <strong>${candidateName}</strong></p>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">You have been officially registered as a candidate in: <strong>${electionName}</strong>.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;">
        <p style="color:#166534;font-size:15px;margin:0;font-weight:600;">Your candidacy has been confirmed.</p>
        <p style="color:#15803d;font-size:14px;margin:8px 0 0;">Voters will be able to select you once the election begins. Good luck.</p>
      </div>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">This is an automated message from BlockVotes.</p>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${SENDER}>`,
      to: opts.to,
      subject: `You Are Registered as a Candidate - ${opts.electionName}`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}
