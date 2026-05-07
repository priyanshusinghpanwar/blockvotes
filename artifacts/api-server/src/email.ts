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

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVoterCredentials(opts: {
  to: string;
  voterName: string;
  electionName: string;
  electionId: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, error: "Brevo SMTP not configured" };

  const loginUrl = `${process.env.APP_URL || "http://localhost:5173"}/voter/login`;

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px 24px;">
    <div style="background:#0f172a;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#38bdf8;font-size:28px;margin:0;">BlockVotes</h1>
      <p style="color:#94a3b8;margin:8px 0 0;">Secure Blockchain Voting System</p>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <p style="color:#475569;font-size:16px;margin:0 0 8px;">Hello, <strong>${opts.voterName}</strong></p>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">You have been registered as a voter for: <strong>${opts.electionName}</strong>.</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #e2e8f0;">
        <p style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;font-weight:700;">Your Login Credentials</p>
        <div style="margin-bottom:14px;">
          <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;font-weight:600;text-transform:uppercase;">Election ID</p>
          <p style="font-family:monospace;background:#0f172a;color:#38bdf8;padding:10px 14px;border-radius:8px;font-size:14px;margin:0;word-break:break-all;">${opts.electionId}</p>
        </div>
        <div style="margin-bottom:14px;">
          <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;font-weight:600;text-transform:uppercase;">Email</p>
          <p style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:14px;margin:0;">${opts.to}</p>
        </div>
        <div>
          <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;font-weight:600;text-transform:uppercase;">Password </p>
          <p style="font-family:monospace;background:#0f172a;color:#22c55e;padding:10px 14px;border-radius:8px;font-size:26px;margin:0;text-align:center;letter-spacing:8px;font-weight:bold;">${opts.otp}</p>
        </div>
      </div>
      <a href="${loginUrl}" style="display:block;background:#3b82f6;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-weight:700;font-size:15px;">Go to Voter Portal →</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">This is an automated message from BlockVotes.</p>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${process.env.BREVO_SENDER}>`,
      to: opts.to,
      subject: `Your BlockVotes Login Credentials — ${opts.electionName}`,
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

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px 24px;">
    <div style="background:#0f172a;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#38bdf8;font-size:28px;margin:0;">BlockVotes</h1>
      <p style="color:#94a3b8;margin:8px 0 0;">Secure Blockchain Voting System</p>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <p style="color:#475569;font-size:16px;margin:0 0 8px;">Hello, <strong>${opts.candidateName}</strong></p>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">You have been officially registered as a candidate in: <strong>${opts.electionName}</strong>.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;">
        <p style="color:#166534;font-size:15px;margin:0;font-weight:600;">✅ Your candidacy has been confirmed.</p>
        <p style="color:#15803d;font-size:14px;margin:8px 0 0;">Voters will be able to select you once the election begins. Good luck!</p>
      </div>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">This is an automated message from BlockVotes.</p>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"BlockVotes" <${process.env.BREVO_SENDER}>`,
      to: opts.to,
      subject: `You're a Candidate — ${opts.electionName}`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}
