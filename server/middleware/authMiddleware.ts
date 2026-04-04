import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

interface AuthTokenPayload extends JwtPayload {
  userId: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.slice(7).trim();

  if (!process.env.JWT_SECRET) {
    res.status(500).json({ error: "JWT_SECRET is not configured" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as AuthTokenPayload;

    if (typeof decoded.userId !== "number") {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    req.user = { id: decoded.userId };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
