const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeEmail,
  validateElectionInput,
  validateLoginInput,
  validateRegistrationInput,
  validateUserStatus,
  validateVoteInput
} = require("../lib/validation");

test("registration input is normalized and validated", () => {
  const payload = validateRegistrationInput({
    name: "  Student One  ",
    email: " STUDENT@college.edu ",
    password: "password123"
  });

  assert.deepEqual(payload, {
    name: "Student One",
    email: "student@college.edu",
    password: "password123"
  });
});

test("registration rejects weak values", () => {
  assert.throws(() => validateRegistrationInput({ name: "A", email: "bad", password: "123" }));
});

test("login validation normalizes email", () => {
  assert.deepEqual(validateLoginInput({ email: " ADMIN@college.edu ", password: "x" }), {
    email: "admin@college.edu",
    password: "x"
  });
});

test("vote validation accepts positive integers only", () => {
  assert.deepEqual(validateVoteInput({ candidateId: "2" }), { candidateId: 2 });
  assert.throws(() => validateVoteInput({ candidateId: "0" }));
});

test("election validation requires a title and at least two candidates", () => {
  const payload = validateElectionInput({
    title: " Student Election 2026 ",
    candidates: [
      { name: "Candidate One", party: "Union" },
      { name: "Candidate Two", party: "Independent" }
    ]
  });

  assert.equal(payload.title, "Student Election 2026");
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.candidates[0].candidateId, 1);
  assert.throws(() => validateElectionInput({ title: "Bad", candidates: [{ name: "Only One" }] }));
});

test("status validation only accepts known values", () => {
  assert.deepEqual(validateUserStatus({ status: "Approved" }), { status: "Approved" });
  assert.throws(() => validateUserStatus({ status: "Unknown" }));
});

test("normalizeEmail trims and lowercases addresses", () => {
  assert.equal(normalizeEmail(" Person@Example.com "), "person@example.com");
});
