const { pool } = require("../lib/db");
const { getUser } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  try {
    const { genericMessage } = req.body;
    if (!genericMessage) {
      return res.status(400).json({ error: "Generic message is required" });
    }

    const existing = await pool.query(
      "SELECT id FROM drops WHERE user_id = $1",
      [user.userId],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE drops SET generic_message = $1 WHERE user_id = $2",
        [genericMessage, user.userId],
      );
      return res.json({ dropId: existing.rows[0].id, username: user.username });
    }

    const result = await pool.query(
      "INSERT INTO drops (user_id, generic_message) VALUES ($1, $2) RETURNING id",
      [user.userId, genericMessage],
    );
    return res
      .status(201)
      .json({ dropId: result.rows[0].id, username: user.username });
  } catch (err) {
    console.error("Create drop error:", err);
    return res.status(500).json({ error: "Failed to create drop" });
  }
};
