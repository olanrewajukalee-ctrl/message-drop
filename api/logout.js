const { clearTokenCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Set-Cookie", clearTokenCookie());
  return res.json({ success: true });
};
