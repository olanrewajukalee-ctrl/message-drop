const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const path = require("path");
const bcrypt = require("bcryptjs");

// Catch any uncaught errors so we can see them
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

const app = express();
const PORT = process.env.PORT || 5000;
const SALT_ROUNDS = 12;

// Keep-alive: prevent Replit from killing the process due to inactivity
setInterval(() => {
  console.log("Keep-alive check:", new Date().toISOString());
}, 60000);

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Session middleware (in-memory store for now)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "message-drop-secret-key-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true },
  }),
);

// Disable caching for API routes
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ─── Database Init ───────────────────────────────────────────────
async function initDB() {
  console.log("Connecting to database...");

  // Test connection first
  try {
    const testResult = await pool.query("SELECT NOW()");
    console.log("Database connected:", testResult.rows[0].now);
  } catch (err) {
    console.error("DATABASE CONNECTION FAILED:", err.message);
    throw err;
  }

  console.log("Creating users table...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Users table created.");

  console.log("Creating drops table...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drops (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      generic_message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Drops table created.");

  console.log("Creating messages table...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      drop_id INTEGER REFERENCES drops(id) ON DELETE CASCADE,
      nickname VARCHAR(100) NOT NULL,
      question TEXT NOT NULL,
      hint TEXT,
      passcode_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Messages table created.");

  console.log("Creating views table...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS views (
      id SERIAL PRIMARY KEY,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      nickname VARCHAR(100) NOT NULL,
      viewed_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Views table created.");
  console.log("All tables ready!");
}

// ─── Auth Middleware ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// ─── Auth Routes ─────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  console.log("Register hit:", req.body);
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

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, passwordHash],
    );

    req.session.userId = result.rows[0].id;
    req.session.username = result.rows[0].username;
    res.status(201).json({ username: result.rows[0].username });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/me", (req, res) => {
  if (req.session.userId) {
    res.json({ username: req.session.username });
  } else {
    res.status(401).json({ error: "Not logged in" });
  }
});

// ─── Drop Routes (Sender) ───────────────────────────────────────
app.post("/api/drops", requireAuth, async (req, res) => {
  try {
    const { genericMessage } = req.body;
    if (!genericMessage) {
      return res.status(400).json({ error: "Generic message is required" });
    }

    // Check if user already has a drop
    const existing = await pool.query(
      "SELECT id FROM drops WHERE user_id = $1",
      [req.session.userId],
    );
    if (existing.rows.length > 0) {
      // Update existing drop
      await pool.query(
        "UPDATE drops SET generic_message = $1 WHERE user_id = $2",
        [genericMessage, req.session.userId],
      );
      return res.json({
        dropId: existing.rows[0].id,
        username: req.session.username,
      });
    }

    const result = await pool.query(
      "INSERT INTO drops (user_id, generic_message) VALUES ($1, $2) RETURNING id",
      [req.session.userId, genericMessage],
    );
    res
      .status(201)
      .json({ dropId: result.rows[0].id, username: req.session.username });
  } catch (err) {
    console.error("Create drop error:", err);
    res.status(500).json({ error: "Failed to create drop" });
  }
});

app.get("/api/drops/mine", requireAuth, async (req, res) => {
  try {
    const drop = await pool.query("SELECT * FROM drops WHERE user_id = $1", [
      req.session.userId,
    ]);
    if (drop.rows.length === 0) {
      return res.json({ drop: null, messages: [] });
    }

    const messages = await pool.query(
      "SELECT m.*, (SELECT COUNT(*) FROM views v WHERE v.message_id = m.id) AS view_count FROM messages m WHERE m.drop_id = $1 ORDER BY m.created_at DESC",
      [drop.rows[0].id],
    );

    const views = await pool.query(
      "SELECT v.nickname, v.viewed_at, v.message_id FROM views v INNER JOIN messages m ON v.message_id = m.id WHERE m.drop_id = $1 ORDER BY v.viewed_at DESC",
      [drop.rows[0].id],
    );

    res.json({
      drop: drop.rows[0],
      messages: messages.rows,
      views: views.rows,
    });
  } catch (err) {
    console.error("Fetch drop error:", err);
    res.status(500).json({ error: "Failed to fetch drop" });
  }
});

// Add a personalized message to the sender's drop
app.post("/api/drops/messages", requireAuth, async (req, res) => {
  try {
    const { nickname, question, hint, passcode, content } = req.body;
    if (!nickname || !question || !passcode || !content) {
      return res
        .status(400)
        .json({
          error: "Nickname, question, passcode, and message are required",
        });
    }

    // Get sender's drop
    const drop = await pool.query("SELECT id FROM drops WHERE user_id = $1", [
      req.session.userId,
    ]);
    if (drop.rows.length === 0) {
      return res.status(400).json({ error: "Create a drop first" });
    }

    // Check if nickname already exists in this drop
    const existing = await pool.query(
      "SELECT id FROM messages WHERE drop_id = $1 AND LOWER(nickname) = LOWER($2)",
      [drop.rows[0].id, nickname.trim()],
    );
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "A message for this nickname already exists" });
    }

    const passcodeHash = await bcrypt.hash(
      passcode.toLowerCase().trim(),
      SALT_ROUNDS,
    );
    const result = await pool.query(
      "INSERT INTO messages (drop_id, nickname, question, hint, passcode_hash, content) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [
        drop.rows[0].id,
        nickname.trim(),
        question.trim(),
        hint?.trim() || null,
        passcodeHash,
        content.trim(),
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Add message error:", err);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// Delete a message from the sender's drop
app.delete("/api/drops/messages/:id", requireAuth, async (req, res) => {
  try {
    const drop = await pool.query("SELECT id FROM drops WHERE user_id = $1", [
      req.session.userId,
    ]);
    if (drop.rows.length === 0) {
      return res.status(404).json({ error: "No drop found" });
    }

    await pool.query("DELETE FROM messages WHERE id = $1 AND drop_id = $2", [
      req.params.id,
      drop.rows[0].id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// ─── Receiver Routes (Public) ────────────────────────────────────

// Get drop by username (public page)
app.get("/api/drop/:username", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.generic_message, d.created_at, u.username
       FROM drops d
       JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [req.params.username],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No drop found for this user" });
    }

    // Return drop info + count of personalized messages
    const msgCount = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE drop_id = $1",
      [result.rows[0].id],
    );

    res.json({
      username: result.rows[0].username,
      genericMessage: result.rows[0].generic_message,
      messageCount: parseInt(msgCount.rows[0].count),
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error("Fetch public drop error:", err);
    res.status(500).json({ error: "Failed to fetch drop" });
  }
});

// Autocomplete: return matching nicknames after 4+ chars
app.get("/api/drop/:username/autocomplete", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 4) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT m.nickname FROM messages m
       JOIN drops d ON m.drop_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
         AND LOWER(m.nickname) LIKE LOWER($2)
       LIMIT 8`,
      [req.params.username, q.trim() + "%"],
    );

    res.json(result.rows.map((r) => r.nickname));
  } catch (err) {
    console.error("Autocomplete error:", err);
    res.status(500).json({ error: "Autocomplete failed" });
  }
});

// Check inbox: verify nickname + passcode
app.post("/api/drop/:username/check", async (req, res) => {
  try {
    const { nickname, passcode } = req.body;
    if (!nickname || !passcode) {
      return res.status(400).json({ error: "Nickname and answer required" });
    }

    const result = await pool.query(
      `SELECT m.* FROM messages m
       JOIN drops d ON m.drop_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
         AND LOWER(m.nickname) = LOWER($2)`,
      [req.params.username, nickname.trim()],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No message found for that name" });
    }

    const msg = result.rows[0];
    const match = await bcrypt.compare(
      passcode.toLowerCase().trim(),
      msg.passcode_hash,
    );

    if (match) {
      // Log the view
      await pool.query(
        "INSERT INTO views (message_id, nickname) VALUES ($1, $2)",
        [msg.id, nickname.trim()],
      );
      res.json({
        found: true,
        question: msg.question,
        hint: msg.hint,
        content: msg.content,
      });
    } else {
      res.json({
        found: true,
        question: msg.question,
        hint: msg.hint,
        content: null,
      });
    }
  } catch (err) {
    console.error("Check inbox error:", err);
    res.status(500).json({ error: "Failed to check inbox" });
  }
});

// ─── Global error handler (Express 5) ────────────────────────────
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Catch-all: serve index.html for client-side routing ─────────
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start Server ────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    const server = await app.listen(PORT, "0.0.0.0");
    console.log(`Message Drop server running on http://0.0.0.0:${PORT}`);
    console.log("Server is listening — process should stay alive.");
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}
start();
