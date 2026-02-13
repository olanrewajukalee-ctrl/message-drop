const { pool } = require("../../../lib/db");
const { comparePassword } = require("../../../lib/auth");
const url = require("url");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    let username = req.query.username;
    if (!username) {
      const parsed = url.parse(req.url, true);
      const parts = parsed.pathname.split("/").filter(Boolean);
      // URL is /api/drop/USERNAME/check
      if (parts.length >= 3) username = decodeURIComponent(parts[2]);
    }
    const { nickname, passcode } = req.body;

    if (!username) return res.status(400).json({ error: "Username required" });
    if (!nickname || !passcode) {
      return res.status(400).json({ error: "Nickname and answer required" });
    }

    const result = await pool.query(
      `SELECT m.* FROM messages m
       JOIN drops d ON m.drop_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
         AND LOWER(m.nickname) = LOWER($2)`,
      [username, nickname.trim()],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No message found for that name" });
    }

    const msg = result.rows[0];
    const match = await comparePassword(
      passcode.toLowerCase().trim(),
      msg.passcode_hash,
    );

    if (match) {
      await pool.query(
        "INSERT INTO views (message_id, nickname) VALUES ($1, $2)",
        [msg.id, nickname.trim()],
      );
      return res.json({
        found: true,
        question: msg.question,
        hint: msg.hint,
        content: msg.content,
      });
    } else {
      return res.json({
        found: true,
        question: msg.question,
        hint: msg.hint,
        content: null,
      });
    }
  } catch (err) {
    console.error("Check inbox error:", err);
    return res.status(500).json({ error: "Failed to check inbox" });
  }
};
