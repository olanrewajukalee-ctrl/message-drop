const { pool } = require("../lib/db");
const { getUser, hashPassword } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  // POST - add a message
  if (req.method === "POST") {
    try {
      const { nickname, question, hint, passcode, content } = req.body;

      if (!nickname || !question || !passcode || !content) {
        return res
          .status(400)
          .json({
            error: "Nickname, question, passcode, and message are required",
          });
      }

      const drop = await pool.query("SELECT id FROM drops WHERE user_id = $1", [
        user.userId,
      ]);
      if (drop.rows.length === 0) {
        return res.status(400).json({ error: "Create a drop first" });
      }

      const existing = await pool.query(
        "SELECT id FROM messages WHERE drop_id = $1 AND LOWER(nickname) = LOWER($2)",
        [drop.rows[0].id, nickname.trim()],
      );
      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "A message for this nickname already exists" });
      }

      const passcodeHash = await hashPassword(passcode.toLowerCase().trim());
      const result = await pool.query(
        `INSERT INTO messages (drop_id, nickname, question, hint, passcode_hash, content)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          drop.rows[0].id,
          nickname.trim(),
          question.trim(),
          hint?.trim() || null,
          passcodeHash,
          content.trim(),
        ],
      );

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Add message error:", err);
      return res.status(500).json({ error: "Failed to add message" });
    }
  }

  // DELETE - remove a message (id passed as query param)
  if (req.method === "DELETE") {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Message ID required" });

      const drop = await pool.query("SELECT id FROM drops WHERE user_id = $1", [
        user.userId,
      ]);
      if (drop.rows.length === 0) {
        return res.status(404).json({ error: "No drop found" });
      }

      await pool.query("DELETE FROM messages WHERE id = $1 AND drop_id = $2", [
        id,
        drop.rows[0].id,
      ]);
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete message error:", err);
      return res.status(500).json({ error: "Failed to delete message" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
