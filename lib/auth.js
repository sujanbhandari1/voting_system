const crypto = require("crypto");

const SCRYPT_PREFIX = "scrypt";

function hashLegacyPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    const [, salt, expectedKey] = storedHash.split("$");
    if (!salt || !expectedKey) {
      return false;
    }

    const actualKey = crypto.scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expectedKey, "hex");

    if (actualKey.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(actualKey, expectedBuffer);
  }

  return hashLegacyPassword(password) === storedHash;
}

function generateSessionId() {
  return crypto.randomBytes(24).toString("hex");
}

function generateTransactionHash() {
  return `0x${crypto.randomBytes(18).toString("hex")}`;
}

module.exports = {
  generateSessionId,
  generateTransactionHash,
  hashLegacyPassword,
  hashPassword,
  verifyPassword
};
