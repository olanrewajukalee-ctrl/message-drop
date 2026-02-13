const { pool } = require("../lib/db");
const { createToken, getTokenCookie, hashPassword } = require("../lib/auth");

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (username.length < 3 || username.length > 30) {
      return res
        .status(400)
        .json({ error: "Username must be 3-30 characters" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res
        .status(400)
        .json({
          error:
            "Username can only contain letters, numbers, hyphens, underscores",
        });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
      [username],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, passwordHash],
    );

    const user = result.rows[0];
    const token = createToken(user.id, user.username);
    res.setHeader("Set-Cookie", getTokenCookie(token));
    return res.status(201).json({ username: user.username });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
};
