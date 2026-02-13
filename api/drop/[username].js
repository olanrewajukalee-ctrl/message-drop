const { pool } = require("../../lib/db");
const url = require("url");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // Try req.query first, then parse from URL path
    let username = req.query.username;
    if (!username) {
      const parsed = url.parse(req.url, true);
      const parts = parsed.pathname.split("/").filter(Boolean);
      // URL is /api/drop/USERNAME
      if (parts.length >= 3) username = decodeURIComponent(parts[2]);
    }
    if (!username) return res.status(400).json({ error: "Username required" });

    const result = await pool.query(
      `SELECT d.id, d.generic_message, d.created_at, u.username
       FROM drops d JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [username],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No drop found for this user" });
    }

    const msgCount = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE drop_id = $1",
      [result.rows[0].id],
    );

    return res.json({
      username: result.rows[0].username,
      genericMessage: result.rows[0].generic_message,
      messageCount: parseInt(msgCount.rows[0].count),
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error("Fetch public drop error:", err);
    return res.status(500).json({ error: "Failed to fetch drop" });
  }
};
