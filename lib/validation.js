const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateRegistrationInput(body) {
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  assert(name.length >= 2 && name.length <= 80, "Name must be between 2 and 80 characters.");
  assert(EMAIL_PATTERN.test(email), "Please enter a valid email address.");
  assert(password.length >= 8 && password.length <= 128, "Password must be between 8 and 128 characters.");

  return { name, email, password };
}

function validateLoginInput(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  assert(EMAIL_PATTERN.test(email), "Please enter a valid email address.");
  assert(password.length >= 1 && password.length <= 128, "Password is required.");

  return { email, password };
}

function validateVoteInput(body) {
  const candidateId = Number(body.candidateId);
  assert(Number.isInteger(candidateId) && candidateId > 0, "A valid candidate is required.");
  return { candidateId };
}

function validateElectionInput(body) {
  const title = String(body.title || "").trim();
  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];

  const candidates = rawCandidates
    .map((candidate, index) => ({
      candidateId: index + 1,
      name: String(candidate.name || "").trim(),
      party: String(candidate.party || "").trim(),
      agenda: Array.isArray(candidate.agenda)
        ? candidate.agenda.map((point) => String(point || "").trim()).filter(Boolean)
        : String(candidate.agenda || "")
            .split("\n")
            .map((point) => point.trim())
            .filter(Boolean),
      votes: 0
    }))
    .filter((candidate) => candidate.name);

  assert(title.length >= 5 && title.length <= 120, "Election title must be between 5 and 120 characters.");
  assert(candidates.length >= 2 && candidates.length <= 20, "Election must have between 2 and 20 candidates.");

  candidates.forEach((candidate) => {
    assert(candidate.name.length >= 2 && candidate.name.length <= 80, "Candidate name must be between 2 and 80 characters.");
    assert(candidate.party.length <= 80, "Candidate party must be 80 characters or fewer.");
    assert(candidate.agenda.length <= 10, "Candidate agenda must include 10 points or fewer.");
    candidate.agenda.forEach((point) => {
      assert(point.length <= 140, "Candidate agenda points must be 140 characters or fewer.");
    });
  });

  return { title, candidates };
}

function validateUserStatus(body) {
  const allowedStatuses = new Set(["Approved", "Pending Approval", "Rejected"]);
  const status = String(body.status || "").trim();
  assert(allowedStatuses.has(status), "Invalid status.");
  return { status };
}

module.exports = {
  normalizeEmail,
  validateElectionInput,
  validateLoginInput,
  validateRegistrationInput,
  validateUserStatus,
  validateVoteInput
};
