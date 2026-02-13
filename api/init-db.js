const { initDB } = require("../lib/db");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    await initDB();
    return res.json({ success: true, message: "Database tables created" });
  } catch (err) {
    console.error("Init DB error:", err);
    return res.status(500).json({ error: "Failed to initialize database" });
  }
};
