const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET =
  process.env.JWT_SECRET || "message-drop-jwt-secret-change-me";
const SALT_ROUNDS = 12;

function createToken(userId, username) {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getTokenCookie(token) {
  return `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}

function clearTokenCookie() {
  return "token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [key, ...rest] = c.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  });
  return cookies;
}

function getUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.token) return null;
  return verifyToken(cookies.token);
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  createToken,
  verifyToken,
  getTokenCookie,
  clearTokenCookie,
  getUser,
  hashPassword,
  comparePassword,
};
