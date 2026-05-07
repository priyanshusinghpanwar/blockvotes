import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("..", import.meta.url));
const entryFile = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const baseUrl = "http://127.0.0.1:3101";
const healthUrl = `${baseUrl}/api/healthz`;

let serverProcess = null;
let serverLogs = "";

function appendServerLog(chunk) {
  serverLogs += chunk.toString();
  if (serverLogs.length > 20000) {
    serverLogs = serverLogs.slice(-20000);
  }
}

async function waitForServerReady() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`API server did not become ready.\nRecent logs:\n${serverLogs}`);
}

async function requestJson(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (cookie) {
    headers["cookie"] = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return { response, payload };
}

function getCookie(response) {
  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : null;
}

function buildVoterCookie(voterId, electionId) {
  const payload = {
    voterId,
    electionId,
    exp: Date.now() + 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", "test-session-secret")
    .update(encodedPayload)
    .digest("base64url");
  return `blockvotes_voter_session=${encodedPayload}.${signature}`;
}

before(async () => {
  serverProcess = spawn(
    process.execPath,
    ["--enable-source-maps", entryFile],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "3101",
        BLOCKCHAIN_ENABLED: "false",
        ADMIN_SESSION_SECRET: "test-session-secret",
        VOTER_SESSION_SECRET: "test-session-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", appendServerLog);
  serverProcess.stderr.on("data", appendServerLog);

  await waitForServerReady();
});

after(async () => {
  if (!serverProcess) return;

  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    serverProcess.once("exit", () => resolve());
    setTimeout(resolve, 5000);
  });
});

test("admin routes require authentication", async () => {
  const { response, payload } = await requestJson("/api/elections?company_id=test-company");

  assert.equal(response.status, 401);
  assert.equal(payload?.status, "error");
});

test("admin login, create election, import voters, cast vote, and end election", async () => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const companyEmail = `finalyear-${unique}@example.com`;
  const companyPassword = "BlockVotes2026";
  const companyName = `Final Year Demo ${unique}`;
  const voterEmail = `voter-${unique}@example.com`;
  const voterMobile = `987654${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

  const registerResult = await requestJson("/api/company/register", {
    method: "POST",
    body: {
      name: companyName,
      email: companyEmail,
      password: companyPassword,
    },
  });

  assert.equal(registerResult.response.status, 200);
  assert.equal(registerResult.payload?.status, "success");
  assert.ok(registerResult.payload?.data?.id);

  const registerCookie = getCookie(registerResult.response);
  assert.ok(registerCookie, "expected register response to set an admin session cookie");

  const logoutResult = await requestJson("/api/company/logout", {
    method: "POST",
    cookie: registerCookie,
  });
  assert.equal(logoutResult.payload?.status, "success");

  const loginResult = await requestJson("/api/company/login", {
    method: "POST",
    body: {
      email: companyEmail,
      password: companyPassword,
    },
  });

  assert.equal(loginResult.response.status, 200);
  assert.equal(loginResult.payload?.status, "success");

  const adminCookie = getCookie(loginResult.response);
  assert.ok(adminCookie, "expected login response to set an admin session cookie");

  const meResult = await requestJson("/api/company/me", {
    cookie: adminCookie,
  });
  assert.equal(meResult.payload?.status, "success");
  assert.equal(meResult.payload?.data?.email, companyEmail);

  const createElectionResult = await requestJson("/api/elections", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name: `Election ${unique}`,
      description: "Final year integration test election",
      start_time_ist: "2030-01-01 10:00",
      end_time_ist: "2030-01-01 18:00",
    },
  });

  assert.equal(createElectionResult.payload?.status, "success");
  const electionId = createElectionResult.payload?.data?.id;
  assert.ok(electionId, "expected election creation to return an election id");

  const createCandidateResult = await requestJson("/api/candidates", {
    method: "POST",
    cookie: adminCookie,
    body: {
      election_id: electionId,
      name: `Candidate ${unique}`,
      description: "Primary candidate for integration test",
    },
  });
  assert.equal(createCandidateResult.payload?.status, "success");

  const createSecondCandidateResult = await requestJson("/api/candidates", {
    method: "POST",
    cookie: adminCookie,
    body: {
      election_id: electionId,
      name: `Candidate B ${unique}`,
      description: "Second candidate required to activate the election",
    },
  });
  assert.equal(createSecondCandidateResult.payload?.status, "success");

  const importVotersResult = await requestJson("/api/voters/import", {
    method: "POST",
    cookie: adminCookie,
    body: {
      election_id: electionId,
      csv_content: [
        "name,voter_id,mobile,email_id,age,gender",
        `Integration Voter ${unique},VID-${unique},${voterMobile},${voterEmail},22,male`,
      ].join("\n"),
    },
  });

  assert.equal(importVotersResult.payload?.status, "success");
  assert.equal(importVotersResult.payload?.data?.added, 1);

  const votersResult = await requestJson(`/api/voters?election_id=${encodeURIComponent(electionId)}`, {
    cookie: adminCookie,
  });
  assert.equal(votersResult.payload?.status, "success");
  assert.ok(Array.isArray(votersResult.payload?.data));
  assert.equal(votersResult.payload.data.length, 1);

  const voterRecord = votersResult.payload.data[0];
  assert.ok(voterRecord?.id, "expected voter list to include the inserted voter");

  const profileUpdateResult = await requestJson("/api/voters/profile/update", {
    method: "POST",
    body: {
      voter_id: voterRecord.id,
      election_id: electionId,
      name: `Integration Voter ${unique}`,
      mobile: voterMobile,
      age: 22,
      gender: "male",
      photo_url: "https://example.com/photo.png",
      signature_url: "https://example.com/signature.png",
    },
  });
  assert.equal(profileUpdateResult.payload?.status, "success");

  const startElectionResult = await requestJson(`/api/elections/${encodeURIComponent(electionId)}/start`, {
    method: "POST",
    cookie: adminCookie,
  });
  assert.equal(startElectionResult.payload?.status, "success");

  const candidatesResult = await requestJson(`/api/candidates?election_id=${encodeURIComponent(electionId)}`, {
    cookie: adminCookie,
  });
  assert.equal(candidatesResult.payload?.status, "success");
  assert.ok(Array.isArray(candidatesResult.payload?.data));
  assert.equal(candidatesResult.payload.data.length, 2);

  const candidateRecord = candidatesResult.payload.data[0];
  assert.ok(candidateRecord?.id, "expected candidate list to include the inserted candidate");

  const unauthorizedVoteResult = await requestJson("/api/vote", {
    method: "POST",
    body: {
      voter_id: voterRecord.id,
      election_id: electionId,
      candidate_id: candidateRecord.id,
    },
  });
  assert.equal(unauthorizedVoteResult.response.status, 401);
  assert.equal(unauthorizedVoteResult.payload?.status, "error");

  const voterCookie = buildVoterCookie(voterRecord.id, electionId);
  const castVoteResult = await requestJson("/api/vote", {
    method: "POST",
    cookie: voterCookie,
    body: {
      candidate_id: candidateRecord.id,
    },
  });
  assert.equal(castVoteResult.payload?.status, "success");
  assert.ok(castVoteResult.payload?.data?.block_hash);

  const endElectionResult = await requestJson(`/api/elections/${encodeURIComponent(electionId)}/end`, {
    method: "POST",
    cookie: adminCookie,
  });
  assert.equal(endElectionResult.payload?.status, "success");
});
