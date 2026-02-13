const { pool } = require("../lib/db");
const { getUser } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  try {
    const drop = await pool.query("SELECT * FROM drops WHERE user_id = $1", [
      user.userId,
    ]);

    if (drop.rows.length === 0) {
      return res.json({ drop: null, messages: [], views: [] });
    }

    const messages = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM views v WHERE v.message_id = m.id) AS view_count
       FROM messages m WHERE m.drop_id = $1 ORDER BY m.created_at DESC`,
      [drop.rows[0].id],
    );

    const views = await pool.query(
      `SELECT v.nickname, v.viewed_at, v.message_id
       FROM views v INNER JOIN messages m ON v.message_id = m.id
       WHERE m.drop_id = $1 ORDER BY v.viewed_at DESC`,
      [drop.rows[0].id],
    );

    return res.json({
      drop: drop.rows[0],
      messages: messages.rows,
      views: views.rows,
    });
  } catch (err) {
    console.error("Fetch drop error:", err);
    return res.status(500).json({ error: "Failed to fetch drop" });
  }
};
