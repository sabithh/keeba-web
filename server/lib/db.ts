import { Pool, QueryResult, QueryResultRow } from "pg";

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable");
}

export const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT,
  date_of_birth DATE,
  phone TEXT,
  address TEXT,
  occupation TEXT,
  about_me TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('aadhaar', 'passport', 'license', 'certificate', 'photo', 'other')),
  cloudinary_url TEXT,
  cloudinary_public_id TEXT,
  extracted_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
`;

export async function initDb(): Promise<void> {
  await pool.query(schemaSql);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
