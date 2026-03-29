const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateSessionId,
  generateTransactionHash,
  hashLegacyPassword,
  hashPassword,
  verifyPassword
} = require("../lib/auth");

test("hashPassword creates a scrypt hash that verifies correctly", () => {
  const password = "secure-password-123";
  const hash = hashPassword(password);

  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("verifyPassword still supports legacy sha256 hashes", () => {
  const legacyHash = hashLegacyPassword("admin123");

  assert.equal(verifyPassword("admin123", legacyHash), true);
  assert.equal(verifyPassword("admin124", legacyHash), false);
});

test("session and transaction ids are generated in expected formats", () => {
  assert.match(generateSessionId(), /^[a-f0-9]{48}$/);
  assert.match(generateTransactionHash(), /^0x[a-f0-9]{36}$/);
});
