import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { initDb } from "./lib/db";
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import filesRoutes from "./routes/files";
import profileRoutes from "./routes/profile";
import whatsappRoutes from "./routes/whatsapp";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === allowedOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "4mb",
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = buffer;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled server error", error);

  if (error.message.includes("CORS")) {
    res.status(403).json({ error: "Request origin is not allowed" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
});

async function startServer(): Promise<void> {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`Keeba API listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

void startServer();
