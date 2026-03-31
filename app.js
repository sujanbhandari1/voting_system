const sessionState = {
  user: null,
  adminCandidates: []
};

async function api(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin"
  };

  if (options.body !== undefined) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, config);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function setActiveNav() {
  const rawPage = document.body.dataset.page;
  const currentPage = rawPage === "login" || rawPage === "register" ? "dashboard" : rawPage;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === currentPage) {
      link.classList.add("active");
    }
  });
}

function showMessage(target, type, text) {
  if (!target) {
    return;
  }

  target.textContent = text;
  target.className = `message ${type}`;
  target.hidden = false;
}

function formatStatusClass(status) {
  if (status === "Approved" || status === "Active") {
    return "status-approved";
  }
  if (status === "Rejected") {
    return "status-rejected";
  }
  return "status-pending";
}

function renderSession(session) {
  document.querySelectorAll("[data-session-user]").forEach((node) => {
    node.textContent = session?.user ? `${session.user.name} · ${session.user.role}` : "Guest";
  });

  document.querySelectorAll("[data-logout-btn]").forEach((button) => {
    button.hidden = !session?.user;
  });

  document.querySelectorAll("[data-admin-link]").forEach((link) => {
    if (!session?.user || session.user.role !== "admin") {
      link.classList.add("is-hidden");
    } else {
      link.classList.remove("is-hidden");
    }
  });
}

function redirectToHome() {
  window.location.href = "index.html";
}

async function loadSession() {
  const session = await api("/api/session");
  sessionState.user = session.user;
  renderSession(session);
  return session;
}

async function handleLogout() {
  await api("/api/logout", { method: "POST" });
  redirectToHome();
}

function attachSharedHandlers() {
  document.querySelectorAll("[data-logout-btn]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await handleLogout();
      } catch (error) {
        console.error(error);
      }
    });
  });
}

function renderDashboard(data) {
  const welcome = document.querySelector("[data-welcome]");
  if (!welcome) {
    return;
  }

  welcome.textContent = `Welcome, ${data.user.name}`;

  const status = document.querySelector("[data-user-status]");
  status.textContent = data.user.status;
  status.className = `status-pill ${formatStatusClass(data.user.status)}`;

  const title = document.querySelector("[data-election-title]");
  title.textContent = data.election.title;

  const voteAction = document.querySelector("[data-vote-action]");
  const canVote = data.user.status === "Approved" && data.election.active;
  voteAction.classList.toggle("is-disabled", !canVote);
  voteAction.href = canVote ? "voting.html" : "#";
  voteAction.setAttribute("aria-disabled", String(!canVote));

  const totalCandidates = document.querySelector("[data-total-candidates]");
  const totalVotes = document.querySelector("[data-total-votes]");
  const voteState = document.querySelector("[data-vote-status]");
  const resultsAction = document.querySelector("[data-results-action]");
  if (totalCandidates) {
    totalCandidates.textContent = String(data.election.candidates.length);
  }
  if (totalVotes) {
    totalVotes.textContent = String(data.results.totalVotes);
  }
  if (voteState) {
    voteState.textContent = data.election.active ? "Open" : "Closed";
  }
  if (resultsAction) {
    const canSeeResults = data.election.resultsVisibleToVoters || data.user.role === "admin";
    resultsAction.classList.toggle("is-disabled", !canSeeResults);
    resultsAction.href = canSeeResults ? "results.html" : "#";
    resultsAction.setAttribute("aria-disabled", String(!canSeeResults));
  }
}

function candidateCard(candidate, disabled) {
  const agenda = Array.isArray(candidate.agenda) ? candidate.agenda : [];
  const agendaPreview = agenda.slice(0, 5);
  const remainingAgenda = Math.max(agenda.length - agendaPreview.length, 0);

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h3>${candidate.name}</h3>
          <p class="party">${candidate.party || "Independent"}</p>
        </div>
        <span class="tag">Candidate</span>
      </div>
      <div class="agenda-block">
        <strong class="agenda-title">Agenda</strong>
        ${
          agenda.length
            ? `<ul class="agenda-list">
                ${agendaPreview.map((point) => `<li>${point}</li>`).join("")}
                ${remainingAgenda ? `<li class="agenda-more">+ ${remainingAgenda} more</li>` : ""}
              </ul>`
            : `<p class="muted agenda-empty">No agenda points provided.</p>`
        }
      </div>
      <div class="vote-state">
        <p class="muted">Blockchain transaction recording can be demonstrated after the ballot is submitted.</p>
        <button class="primary-btn" data-vote-id="${candidate.id}" ${disabled ? "disabled" : ""}>Vote</button>
      </div>
    </article>
  `;
}

function renderVoting(data) {
  const list = document.querySelector("[data-candidate-list]");
  if (!list) {
    return;
  }

  document.querySelector("[data-election-state]").textContent = data.election.active
    ? "Voting is currently open."
    : "Voting is currently closed.";

  list.innerHTML = data.election.candidates
    .map((candidate) => candidateCard(candidate, !data.canVote))
    .join("");

  const banner = document.querySelector("[data-vote-banner]");
  if (data.hasVoted) {
    showMessage(banner, "success", "You have already voted.");
  } else if (!data.election.active) {
    showMessage(banner, "warning", "Voting has not started yet or has already ended.");
  } else if (data.user.status !== "Approved") {
    showMessage(banner, "error", "Your account is pending approval. You cannot vote yet.");
  } else {
    showMessage(banner, "warning", "Select one candidate to cast your vote.");
  }

  document.querySelector("[data-hash]").textContent =
    data.transactionHash || "A real blockchain transaction hash will appear here after the vote is recorded.";
}

function renderResults(data) {
  const list = document.querySelector("[data-results-list]");
  if (!list) {
    return;
  }

  const message = document.querySelector("[data-results-message]");
  if (message) {
    message.hidden = true;
  }

  document.querySelector("[data-results-title]").textContent = data.election.title;
  document.querySelector("[data-total-votes]").textContent = String(data.totalVotes);

  list.innerHTML = data.election.candidates
    .map((candidate) => {
      const percentage = data.totalVotes === 0 ? 0 : Math.round((candidate.votes / data.totalVotes) * 100);
      return `
        <div class="bar-row">
          <div class="bar-head">
            <span>${candidate.name}</span>
            <span>${candidate.votes} votes</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAdminUsers(users) {
  const table = document.querySelector("[data-user-table]");
  if (!table) {
    return;
  }

  table.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td><span class="status-pill ${formatStatusClass(user.status)}">${user.status}</span></td>
          <td>
            <div class="stack-mobile">
              <button class="secondary-btn" data-user-action="Approved" data-user-id="${user.id}">Approve</button>
              <button class="ghost-btn" data-user-action="Pending Approval" data-user-id="${user.id}">Pending</button>
              <button class="danger-btn" data-user-action="Rejected" data-user-id="${user.id}">Reject</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderAdminElection(election) {
  document.querySelector("[data-admin-election-title]").textContent = election.title;
  const status = document.querySelector("[data-admin-election-status]");
  status.textContent = election.active ? "Active" : "Closed";
  status.className = `status-pill ${formatStatusClass(election.active ? "Active" : "Closed")}`;
  const resultsStatus = document.querySelector("[data-results-visibility-status]");
  if (resultsStatus) {
    resultsStatus.textContent = election.resultsVisibleToVoters ? "Visible to voters" : "Hidden from voters";
    resultsStatus.className = `status-pill ${formatStatusClass(election.resultsVisibleToVoters ? "Approved" : "Pending")}`;
  }
  document.querySelector("[data-candidate-preview]").textContent = election.candidates
    .map((candidate) => `${candidate.name}${candidate.party ? ` (${candidate.party})` : ""}`)
    .join(", ");
  document.querySelector("[data-toggle-election]").textContent = election.active ? "End Voting" : "Start Voting";
  const visibilityButton = document.querySelector("[data-toggle-results-visibility]");
  if (visibilityButton) {
    visibilityButton.textContent = election.resultsVisibleToVoters ? "Hide Results from Voters" : "Show Results to Voters";
  }
}

async function loadAdminData() {
  const [usersPayload, electionPayload] = await Promise.all([
    api("/api/admin/users"),
    api("/api/admin/election")
  ]);

  renderAdminUsers(usersPayload.users);
  renderAdminElection(electionPayload.election);
}

function attachLogin() {
  const form = document.querySelector("[data-login-form]");
  if (!form) {
    return;
  }

  const message = document.querySelector("[data-login-message]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: {
          email: formData.get("email"),
          password: formData.get("password")
        }
      });
      window.location.href = payload.user.role === "admin" ? "admin.html" : "dashboard.html";
    } catch (error) {
      showMessage(message, "error", error.message);
    }
  });
}

function attachRegister() {
  const form = document.querySelector("[data-register-form]");
  if (!form) {
    return;
  }

  const message = document.querySelector("[data-register-message]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      await api("/api/register", {
        method: "POST",
        body: {
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password")
        }
      });
      form.reset();
      showMessage(message, "warning", "Registration submitted. Wait for admin approval after registration.");
    } catch (error) {
      showMessage(message, "error", error.message);
    }
  });
}

function attachVoting() {
  const list = document.querySelector("[data-candidate-list]");
  if (!list) {
    return;
  }

  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const candidateId = target.dataset.voteId;
    if (!candidateId) {
      return;
    }

    try {
      const votePayload = await api("/api/vote", {
        method: "POST",
        body: {
          candidateId: Number(candidateId)
        }
      });
      const payload = await api("/api/election");
      payload.transactionHash = votePayload.transactionHash;
      renderVoting(payload);
    } catch (error) {
      showMessage(document.querySelector("[data-vote-banner]"), "error", error.message);
    }
  });
}

function renderCandidateBuilder() {
  const list = document.querySelector("[data-candidate-admin-list]");
  const empty = document.querySelector("[data-candidate-empty]");
  if (!list || !empty) {
    return;
  }

  empty.hidden = sessionState.adminCandidates.length > 0;
  list.innerHTML = sessionState.adminCandidates
    .map(
      (candidate, index) => `
        <div class="candidate-admin-item">
          <div>
            <strong>${candidate.name}</strong>
            <p class="muted">${candidate.party || "Independent"}</p>
            ${
              candidate.agenda && candidate.agenda.length
                ? `
                  <ul class="agenda-preview">
                    ${candidate.agenda.slice(0, 3).map((point) => `<li>${point}</li>`).join("")}
                  </ul>
                `
                : `<p class="muted agenda-empty">No agenda points provided.</p>`
            }
          </div>
          <button class="danger-btn" type="button" data-remove-candidate="${index}">Remove</button>
        </div>
      `
    )
    .join("");
}

function resetCandidateBuilder() {
  sessionState.adminCandidates = [];
  const nameInput = document.querySelector("[data-candidate-name-input]");
  const partyInput = document.querySelector("[data-candidate-party-input]");
  const agendaInput = document.querySelector("[data-candidate-agenda-input]");
  if (nameInput) {
    nameInput.value = "";
  }
  if (partyInput) {
    partyInput.value = "";
  }
  if (agendaInput) {
    agendaInput.value = "";
  }
  renderCandidateBuilder();
}

function normalizeCandidateName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAgendaInput(rawAgenda) {
  return String(rawAgenda || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
}

function validateCandidateInput(name, party, agenda) {
  if (name.length < 2 || name.length > 80) {
    return "Candidate name must be between 2 and 80 characters.";
  }

  if (party.length > 80) {
    return "Party or group name must be 80 characters or fewer.";
  }

  if (agenda.length > 10) {
    return "Candidate agenda must include 10 points or fewer.";
  }

  if (agenda.some((point) => point.length > 140)) {
    return "Each agenda point must be 140 characters or fewer.";
  }

  const duplicate = sessionState.adminCandidates.some(
    (candidate) => normalizeCandidateName(candidate.name) === normalizeCandidateName(name)
  );
  if (duplicate) {
    return "This candidate has already been added.";
  }

  if (sessionState.adminCandidates.length >= 20) {
    return "You can add at most 20 candidates.";
  }

  return "";
}

function validateElectionDraft(title, candidates) {
  const trimmedTitle = String(title || "").trim();

  if (trimmedTitle.length < 5 || trimmedTitle.length > 120) {
    return "Election title must be between 5 and 120 characters.";
  }

  if (candidates.length < 2) {
    return "Add at least 2 candidates before creating the election.";
  }

  if (candidates.length > 20) {
    return "Election can include at most 20 candidates.";
  }

  return "";
}

function attachAdmin() {
  const table = document.querySelector("[data-user-table]");
  const electionForm = document.querySelector("[data-election-form]");
  const toggleButton = document.querySelector("[data-toggle-election]");
  const resultsVisibilityButton = document.querySelector("[data-toggle-results-visibility]");
  const addCandidateButton = document.querySelector("[data-add-candidate]");
  const candidateList = document.querySelector("[data-candidate-admin-list]");
  const candidateNameInput = document.querySelector("[data-candidate-name-input]");
  const candidatePartyInput = document.querySelector("[data-candidate-party-input]");
  const candidateAgendaInput = document.querySelector("[data-candidate-agenda-input]");
  const message = document.querySelector("[data-admin-message]");

  if (table) {
    table.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const userId = target.dataset.userId;
      const status = target.dataset.userAction;
      if (!userId || !status) {
        return;
      }

      try {
        await api(`/api/admin/users/${userId}/status`, {
          method: "POST",
          body: { status }
        });
        await loadAdminData();
        showMessage(message, "success", "User status updated.");
      } catch (error) {
        showMessage(message, "error", error.message);
      }
    });
  }

  if (addCandidateButton && candidateNameInput && candidatePartyInput) {
    const addCandidate = () => {
      const name = candidateNameInput.value.trim();
      const party = candidatePartyInput.value.trim();
      const agenda = parseAgendaInput(candidateAgendaInput ? candidateAgendaInput.value : "");

      const validationError = validateCandidateInput(name, party, agenda);
      if (validationError) {
        showMessage(message, "error", validationError);
        candidateNameInput.setCustomValidity(validationError);
        candidateNameInput.reportValidity();
        return;
      }

      candidateNameInput.setCustomValidity("");
      sessionState.adminCandidates.push({ name, party, agenda });
      candidateNameInput.value = "";
      candidatePartyInput.value = "";
      if (candidateAgendaInput) {
        candidateAgendaInput.value = "";
      }
      renderCandidateBuilder();
      showMessage(message, "success", "Candidate added to the election list.");
      candidateNameInput.focus();
    };

    addCandidateButton.addEventListener("click", addCandidate);
    candidateNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCandidate();
      }
    });
    candidatePartyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCandidate();
      }
    });
    if (candidateAgendaInput) {
      candidateAgendaInput.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          addCandidate();
        }
      });
    }
  }

  if (candidateList) {
    renderCandidateBuilder();
    candidateList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const index = target.dataset.removeCandidate;
      if (index === undefined) {
        return;
      }

      sessionState.adminCandidates.splice(Number(index), 1);
      renderCandidateBuilder();
      showMessage(message, "warning", "Candidate removed from the election list.");
    });
  }

  if (electionForm) {
    electionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(electionForm);
      const title = String(formData.get("title") || "").trim();
      const candidates = sessionState.adminCandidates.slice();
      const validationError = validateElectionDraft(title, candidates);

      if (validationError) {
        showMessage(message, "error", validationError);
        return;
      }

      try {
        await api("/api/admin/election", {
          method: "POST",
          body: {
            title,
            candidates
          }
        });
        electionForm.reset();
        resetCandidateBuilder();
        await loadAdminData();
        showMessage(message, "success", "Election created successfully.");
      } catch (error) {
        showMessage(message, "error", error.message);
      }
    });
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", async () => {
      try {
        await api("/api/admin/election/toggle", { method: "POST" });
        await loadAdminData();
        showMessage(message, "success", "Voting status updated.");
      } catch (error) {
        showMessage(message, "error", error.message);
      }
    });
  }

  if (resultsVisibilityButton) {
    resultsVisibilityButton.addEventListener("click", async () => {
      try {
        await api("/api/admin/election/results-visibility", { method: "POST" });
        await loadAdminData();
        showMessage(message, "success", "Results visibility updated.");
      } catch (error) {
        showMessage(message, "error", error.message);
      }
    });
  }
}

async function bootstrapPage() {
  setActiveNav();
  attachSharedHandlers();

  let session = { user: null };
  try {
    session = await loadSession();
  } catch (error) {
    console.error(error);
  }

  const page = document.body.dataset.page;

  if (page === "login") {
    attachLogin();
    if (session.user) {
      window.location.href = session.user.role === "admin" ? "admin.html" : "dashboard.html";
    }
    return;
  }

  if (page === "register") {
    attachRegister();
    return;
  }

  if (page === "dashboard") {
    if (!session.user) {
      redirectToHome();
      return;
    }
    if (session.user.role === "admin") {
      window.location.href = "admin.html";
      return;
    }
    const payload = await api("/api/dashboard");
    renderDashboard(payload);
    return;
  }

  if (page === "vote") {
    if (!session.user) {
      redirectToHome();
      return;
    }
    const payload = await api("/api/election");
    renderVoting(payload);
    attachVoting();
    return;
  }

  if (page === "results") {
    try {
      const payload = await api("/api/results");
      renderResults(payload);
    } catch (error) {
      const resultsMessage = document.querySelector("[data-results-message]");
      const resultsList = document.querySelector("[data-results-list]");
      const totalVotes = document.querySelector("[data-total-votes]");
      const title = document.querySelector("[data-results-title]");

      if (title) {
        title.textContent = "Results are currently unavailable";
      }
      if (resultsList) {
        resultsList.innerHTML = "";
      }
      if (totalVotes) {
        totalVotes.textContent = "-";
      }
      showMessage(resultsMessage, "warning", error.message);
    }
    return;
  }

  if (page === "admin") {
    if (!session.user) {
      redirectToHome();
      return;
    }
    if (session.user.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }
    await loadAdminData();
    attachAdmin();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrapPage().catch((error) => {
    console.error(error);
  });
});
