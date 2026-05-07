import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { attachAdminSessionCookie, logoutAdminSession, requireAdminAuth } from "../lib/admin-auth";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "../lib/password";

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.json({ status: "error", message: "Name, email and password are required" });
      return;
    }

    const existing = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.email, email));

    if (existing.length > 0) {
      res.json({ status: "error", message: "Company already exists with this email" });
      return;
    }

    const id = randomUUID();
    const hashed = await hashPassword(password);

    await db.insert(companiesTable).values({
      id,
      name,
      email,
      password: hashed,
    });

    attachAdminSessionCookie(res, { id, email });
    res.json({
      status: "success",
      message: "Company registered successfully.",
      data: { id, name, email },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.json({ status: "error", message: "Email and password are required" });
      return;
    }

    const results = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.email, email));

    if (results.length === 0) {
      res.json({ status: "error", message: "Invalid email or password" });
      return;
    }

    const company = results[0];

    const passwordMatches = await verifyPassword(password, company.password);
    if (!passwordMatches) {
      res.json({ status: "error", message: "Invalid email or password" });
      return;
    }

    if (isLegacyPasswordHash(company.password)) {
      await db
        .update(companiesTable)
        .set({ password: await hashPassword(password) })
        .where(eq(companiesTable.id, company.id));
    }

    attachAdminSessionCookie(res, { id: company.id, email: company.email });
    res.json({
      status: "success",
      message: "Login successful!",
      data: { id: company.id, name: company.name, email: company.email },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  logoutAdminSession(req, res);
  res.json({ status: "success", message: "Logout successful" });
});

router.get("/me", requireAdminAuth, (req, res) => {
  const company = req.adminCompany;
  res.json({
    status: "success",
    message: "Authenticated company fetched",
    data: company
      ? { id: company.id, name: company.name, email: company.email }
      : null,
  });
});

export default router;
