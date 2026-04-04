import { Router } from "express";
import { query } from "../lib/db";
import { authMiddleware } from "../middleware/authMiddleware";

interface ProfileRow {
  id: number;
  user_id: number;
  full_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  occupation: string | null;
  about_me: string | null;
  updated_at: string;
}

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query<ProfileRow>(
      `SELECT id, user_id, full_name, date_of_birth, phone, address, occupation, about_me, updated_at
       FROM profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    res.json(result.rows[0] ?? null);
  } catch (error) {
    console.error("Get profile error", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.put("/", async (req, res) => {
  try {
    const userId = req.user!.id;

    const {
      full_name = null,
      date_of_birth = null,
      phone = null,
      address = null,
      occupation = null,
      about_me = null,
    } = req.body as Record<string, string | null>;

    const normalizedDob = date_of_birth ? String(date_of_birth) : null;

    const result = await query<ProfileRow>(
      `WITH updated AS (
         UPDATE profiles
         SET
           full_name = $2,
           date_of_birth = $3,
           phone = $4,
           address = $5,
           occupation = $6,
           about_me = $7,
           updated_at = NOW()
         WHERE user_id = $1
         RETURNING *
       ),
       inserted AS (
         INSERT INTO profiles (user_id, full_name, date_of_birth, phone, address, occupation, about_me)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (SELECT 1 FROM updated)
         RETURNING *
       )
       SELECT * FROM updated
       UNION ALL
       SELECT * FROM inserted`,
      [
        userId,
        full_name,
        normalizedDob,
        phone,
        address,
        occupation,
        about_me,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update profile error", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
