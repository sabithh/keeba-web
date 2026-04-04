import multer from "multer";
import { Router } from "express";
import { deleteFromCloudinary, uploadBufferToCloudinary } from "../lib/cloudinary";
import { query } from "../lib/db";
import { extractTextFromFile } from "../lib/ocr";
import { authMiddleware } from "../middleware/authMiddleware";

interface DocumentRow {
  id: number;
  user_id: number;
  name: string;
  type: "aadhaar" | "passport" | "license" | "certificate" | "photo" | "other";
  cloudinary_url: string;
  cloudinary_public_id: string;
  extracted_text: string | null;
  created_at: string;
}

const allowedTypes = new Set([
  "aadhaar",
  "passport",
  "license",
  "certificate",
  "photo",
  "other",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const router = Router();

router.use(authMiddleware);

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const file = req.file;
    const type = String(req.body.type ?? "other").toLowerCase();

    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    if (!allowedTypes.has(type)) {
      res.status(400).json({ error: "Invalid document type" });
      return;
    }

    const uploadResult = await uploadBufferToCloudinary(file.buffer, file.originalname);
    const extractedText = await extractTextFromFile(file.buffer, file.mimetype);

    const insertResult = await query<DocumentRow>(
      `INSERT INTO documents (user_id, name, type, cloudinary_url, cloudinary_public_id, extracted_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        file.originalname,
        type,
        uploadResult.url,
        uploadResult.publicId,
        extractedText || null,
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error("Upload file error", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query<DocumentRow>(
      `SELECT id, user_id, name, type, cloudinary_url, cloudinary_public_id, extracted_text, created_at
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get files error", error);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }

    const docResult = await query<DocumentRow>(
      `SELECT id, user_id, name, type, cloudinary_url, cloudinary_public_id, extracted_text, created_at
       FROM documents
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    const document = docResult.rows[0];

    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (document.cloudinary_public_id) {
      await deleteFromCloudinary(document.cloudinary_public_id);
    }

    await query("DELETE FROM documents WHERE id = $1 AND user_id = $2", [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete file error", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
