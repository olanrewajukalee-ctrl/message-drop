const { pool } = require("../../../lib/db");
const url = require("url");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    let { username, q } = req.query;
    if (!username) {
      const parsed = url.parse(req.url, true);
      const parts = parsed.pathname.split("/").filter(Boolean);
      // URL is /api/drop/USERNAME/autocomplete
      if (parts.length >= 3) username = decodeURIComponent(parts[2]);
      if (!q) q = parsed.query.q;
    }
    if (!username) return res.status(400).json({ error: "Username required" });
    if (!q || q.length < 4) return res.json([]);

    const result = await pool.query(
      `SELECT m.nickname FROM messages m
       JOIN drops d ON m.drop_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
         AND LOWER(m.nickname) LIKE LOWER($2)
       LIMIT 8`,
      [username, q.trim() + "%"],
    );

    return res.json(result.rows.map((r) => r.nickname));
  } catch (err) {
    console.error("Autocomplete error:", err);
    return res.status(500).json({ error: "Autocomplete failed" });
  }
};
