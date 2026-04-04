import bcrypt from "bcrypt";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { query } from "../lib/db";

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
}

const router = Router();

function signToken(userId: number): string {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password || password.length < 8) {
      res.status(400).json({ error: "Email and password (min 8 chars) are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query<UserRow>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash",
      [normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user.id);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    console.error("Register error", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userResult = await query<UserRow>(
      "SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

export default router;
