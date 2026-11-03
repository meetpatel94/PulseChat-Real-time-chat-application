const crypto = require("crypto");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
  }
  return secret;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(user) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: String(user._id), username: user.username, iat: now, exp: now + 60 * 60,
  }));
  const input = header + "." + payload;
  const signature = crypto.createHmac("sha256", getSecret()).update(input).digest("base64url");
  return input + "." + signature;
}

function verifyToken(token) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) return null;
  const input = parts[0] + "." + parts[1];
  const expected = crypto.createHmac("sha256", getSecret()).update(input).digest();
  let supplied;
  try { supplied = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header.alg !== "HS256" || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

module.exports = { signToken, verifyToken };
