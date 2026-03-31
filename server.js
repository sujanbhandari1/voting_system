const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");
const blockchain = require("./lib/blockchain");
const {
  hashPassword,
  verifyPassword
} = require("./lib/auth");
const {
  validateElectionInput,
  validateLoginInput,
  validateRegistrationInput,
  validateUserStatus,
  validateVoteInput
} = require("./lib/validation");

const PORT = process.env.PORT || 3000;
const HOST = "127.0.0.1";
const ROOT = __dirname;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "blockchain_voting_system";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const JWT_COOKIE_NAME = "btvs_jwt";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

let mongoClient;
let database;

function seedUsers() {
  return [
    {
      userId: 1,
      name: "System Admin",
      email: "admin@college.edu",
      passwordHash: hashPassword("admin123"),
      role: "admin",
      status: "Approved"
    },
    {
      userId: 2,
      name: "Aarav Student",
      email: "student@college.edu",
      passwordHash: hashPassword("student123"),
      role: "voter",
      status: "Approved"
    },
    {
      userId: 3,
      name: "Nisha Rai",
      email: "nisha@college.edu",
      passwordHash: hashPassword("nisha123"),
      role: "voter",
      status: "Pending Approval"
    }
  ];
}

function seedElection() {
  return {
    electionId: 1,
    title: "College Student Council Election 2026",
    active: true,
    resultsVisibleToVoters: true,
    candidates: [
      {
        candidateId: 1,
        name: "Aarushi Sharma",
        party: "Progressive Student Union",
        agenda: ["Improve library hours", "Expand student scholarships", "Transparent budget reporting"],
        votes: 142
      },
      {
        candidateId: 2,
        name: "Rohan Karki",
        party: "Campus Reform Group",
        agenda: ["Better campus Wi‑Fi coverage", "More internship partnerships", "Simplify club funding process"],
        votes: 118
      },
      {
        candidateId: 3,
        name: "Sanjana Thapa",
        party: "Independent",
        agenda: ["Mental health support programs", "Safer campus transport", "More student feedback sessions"],
        votes: 96
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function authCookie(token) {
  const parts = [
    `${JWT_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearAuthCookie() {
  const parts = [`${JWT_COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function signAuthToken(user) {
  return jwt.sign(
    { sub: String(user.userId), role: user.role, status: user.status },
    JWT_SECRET,
    { expiresIn: Math.floor(SESSION_TTL_MS / 1000) }
  );
}

function verifyAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function sendFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const extension = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extension] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((accumulator, part) => {
    const [key, value] = part.trim().split("=");
    if (key && value) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status
  };
}

function publicElection(election) {
  return {
    title: election.title,
    active: election.active,
    resultsVisibleToVoters: election.resultsVisibleToVoters ?? true,
    contractAddress: election.contractAddress || "",
    chainId: election.chainId || null,
    network: election.network || "",
    candidates: election.candidates.map((candidate) => ({
      id: candidate.candidateId,
      name: candidate.name,
      party: candidate.party,
      agenda: Array.isArray(candidate.agenda) ? candidate.agenda : [],
      votes: candidate.votes
    }))
  };
}

function totalVotes(election) {
  return election.candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

async function getCollections() {
  return {
    users: database.collection("users"),
    elections: database.collection("elections"),
    votes: database.collection("votes")
  };
}

async function ensureIndexes() {
  const { users, elections, votes } = await getCollections();
  await users.createIndex({ userId: 1 }, { unique: true });
  await users.createIndex({ email: 1 }, { unique: true });
  await elections.createIndex({ electionId: 1 }, { unique: true });
  await votes.createIndex({ electionId: 1, userId: 1 }, { unique: true });
}

async function ensureSeedData() {
  const { users, elections } = await getCollections();

  if ((await users.countDocuments()) === 0) {
    await users.insertMany(seedUsers());
  }

  if ((await elections.countDocuments()) === 0) {
    await elections.insertOne(seedElection());
  }
}

async function getElection() {
  const { elections } = await getCollections();
  return elections.findOne({ electionId: 1 });
}

async function getElectionView() {
  const election = await getElection();
  const chainState = await blockchain.getElectionState();
  const contractInfo = await blockchain.getContractInfo();

  if (chainState.candidates.length > 0) {
    const agendaByCandidateId = new Map(
      (election?.candidates || []).map((candidate) => [
        candidate.candidateId,
        Array.isArray(candidate.agenda) ? candidate.agenda : []
      ])
    );

    return {
      electionId: election?.electionId || 1,
      title: chainState.title,
      active: chainState.active,
      resultsVisibleToVoters: election?.resultsVisibleToVoters ?? true,
      candidates: chainState.candidates.map((candidate) => ({
        ...candidate,
        agenda: agendaByCandidateId.get(candidate.candidateId) || []
      })),
      contractAddress: contractInfo.address,
      chainId: contractInfo.chainId,
      network: contractInfo.network
    };
  }

  return {
    ...election,
    contractAddress: contractInfo.address,
    chainId: contractInfo.chainId,
    network: contractInfo.network
  };
}

async function getCurrentUser(request) {
  const cookies = parseCookies(request);
  const token = cookies[JWT_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);
  const userId = Number(payload?.sub);
  if (!Number.isFinite(userId)) {
    return null;
  }

  const { users } = await getCollections();
  return users.findOne({ userId });
}

function requireUser(response, user) {
  if (!user) {
    sendJson(response, 401, { error: "Please login first." });
    return false;
  }
  return true;
}

function requireAdmin(response, user) {
  if (!requireUser(response, user)) {
    return false;
  }
  if (user.role !== "admin") {
    sendJson(response, 403, { error: "Admin access required." });
    return false;
  }
  return true;
}

async function connectToMongo() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  database = mongoClient.db(DB_NAME);
  await ensureIndexes();
  await ensureSeedData();
  await blockchain.initializeBlockchain();

  const election = await getElection();
  const chainState = await blockchain.getElectionState();
  if (!chainState.candidates.length && election?.candidates?.length) {
    await blockchain.configureElection(election);
    if (election.active) {
      await blockchain.setElectionActive(true);
    }
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname;
  const currentUser = await getCurrentUser(request);

  if (request.method === "GET" && pathname === "/api/session") {
    sendJson(response, 200, { user: publicUser(currentUser) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/register") {
    try {
      const body = await readBody(request);
      const { name, email, password } = validateRegistrationInput(body);

      const { users } = await getCollections();
      const existingUser = await users.findOne({ email });
      if (existingUser) {
        sendJson(response, 409, { error: "An account with this email already exists." });
        return;
      }

      const lastUser = await users.find().sort({ userId: -1 }).limit(1).next();
      const nextUserId = lastUser ? lastUser.userId + 1 : 1;

      await users.insertOne({
        userId: nextUserId,
        name,
        email,
        passwordHash: hashPassword(password),
        role: "voter",
        status: "Pending Approval"
      });

      sendJson(response, 201, { message: "Registration completed. Wait for admin approval." });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    try {
      const body = await readBody(request);
      const { email, password } = validateLoginInput(body);

      const { users } = await getCollections();
      const user = await users.findOne({ email });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, { error: "Invalid email or password." });
        return;
      }

      if (!user.passwordHash.startsWith("scrypt$")) {
        await users.updateOne({ userId: user.userId }, { $set: { passwordHash: hashPassword(password) } });
      }

      const token = signAuthToken(user);
      sendJson(
        response,
        200,
        { user: publicUser(user) },
        {
          "Set-Cookie": authCookie(token)
        }
      );
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    sendJson(
      response,
      200,
      { message: "Logged out successfully." },
      {
        "Set-Cookie": clearAuthCookie()
      }
    );
    return;
  }

  if (request.method === "GET" && pathname === "/api/dashboard") {
    if (!requireUser(response, currentUser)) {
      return;
    }

    const election = await getElectionView();
    sendJson(response, 200, {
      user: publicUser(currentUser),
      election: publicElection(election),
      results: {
        totalVotes: totalVotes(election)
      }
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/election") {
    if (!requireUser(response, currentUser)) {
      return;
    }

    const { votes } = await getCollections();
    const election = await getElectionView();
    const vote = await votes.findOne({ electionId: election.electionId, userId: currentUser.userId });
    const hasVotedOnChain = await blockchain.hasUserVoted(currentUser.userId);
    const canVote =
      currentUser.role !== "admin" &&
      currentUser.status === "Approved" &&
      election.active &&
      !vote &&
      !hasVotedOnChain;

    sendJson(response, 200, {
      user: publicUser(currentUser),
      election: publicElection(election),
      hasVoted: Boolean(vote) || Boolean(hasVotedOnChain),
      canVote,
      transactionHash: vote?.transactionHash || ""
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/vote") {
    if (!requireUser(response, currentUser)) {
      return;
    }

    if (currentUser.role === "admin") {
      sendJson(response, 403, { error: "Admin accounts cannot vote." });
      return;
    }

    if (currentUser.status !== "Approved") {
      sendJson(response, 403, { error: "Your account is not approved yet." });
      return;
    }

    try {
      const body = await readBody(request);
      const { candidateId } = validateVoteInput(body);
      const { votes } = await getCollections();
      const election = await getElectionView();

      if (!election.active) {
        sendJson(response, 400, { error: "Voting is currently closed." });
        return;
      }

      const existingVote = await votes.findOne({ electionId: election.electionId, userId: currentUser.userId });
      if (existingVote) {
        sendJson(response, 409, { error: "You have already voted." });
        return;
      }

      const candidate = election.candidates.find((entry) => entry.candidateId === candidateId);
      if (!candidate) {
        sendJson(response, 404, { error: "Candidate not found." });
        return;
      }

      const chainTransaction = await blockchain.castVote({
        userId: currentUser.userId,
        candidateId
      });

      await votes.insertOne({
        electionId: election.electionId,
        userId: currentUser.userId,
        candidateId,
        transactionHash: chainTransaction.hash,
        createdAt: new Date().toISOString()
      });

      sendJson(response, 201, {
        message: "Vote recorded successfully.",
        transactionHash: chainTransaction.hash
      });
    } catch (error) {
      if (error.code === 11000) {
        sendJson(response, 409, { error: "You have already voted." });
        return;
      }
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/results") {
    const election = await getElectionView();
    const canViewResults = election.resultsVisibleToVoters || (currentUser && currentUser.role === "admin");
    if (!canViewResults) {
      sendJson(response, 403, { error: "Results are hidden by the admin right now." });
      return;
    }

    sendJson(response, 200, {
      election: publicElection(election),
      totalVotes: totalVotes(election)
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/users") {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    const { users } = await getCollections();
    const allUsers = await users.find().sort({ userId: 1 }).toArray();
    sendJson(response, 200, {
      users: allUsers.map(publicUser)
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/election") {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    const election = await getElectionView();
    sendJson(response, 200, { election: publicElection(election) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/election") {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    try {
      const body = await readBody(request);
      const { title, candidates } = validateElectionInput(body);

      const { elections, votes } = await getCollections();
      await elections.updateOne(
        { electionId: 1 },
        {
          $set: {
            title,
            active: false,
            resultsVisibleToVoters: false,
            candidates,
            updatedAt: new Date().toISOString()
          },
          $setOnInsert: {
            electionId: 1,
            createdAt: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      await votes.deleteMany({ electionId: 1 });
      const chainTransaction = await blockchain.configureElection({ title, candidates });

      const election = await getElectionView();
      sendJson(response, 201, {
        election: publicElection(election),
        transactionHash: chainTransaction.hash
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/election/toggle") {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    const { elections } = await getCollections();
    const election = await getElectionView();
    await elections.updateOne(
      { electionId: election.electionId },
      {
        $set: {
          active: !election.active,
          updatedAt: new Date().toISOString()
        }
      }
    );
    const chainTransaction = await blockchain.setElectionActive(!election.active);

    const updatedElection = await getElectionView();
    sendJson(response, 200, {
      election: publicElection(updatedElection),
      transactionHash: chainTransaction.hash
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/election/results-visibility") {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    const { elections } = await getCollections();
    const election = await getElectionView();
    await elections.updateOne(
      { electionId: election.electionId },
      {
        $set: {
          resultsVisibleToVoters: !election.resultsVisibleToVoters,
          updatedAt: new Date().toISOString()
        }
      }
    );

    const updatedElection = await getElectionView();
    sendJson(response, 200, { election: publicElection(updatedElection) });
    return;
  }

  const userStatusMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/status$/);
  if (request.method === "POST" && userStatusMatch) {
    if (!requireAdmin(response, currentUser)) {
      return;
    }

    try {
      const body = await readBody(request);
      const { status } = validateUserStatus(body);

      const userId = Number(userStatusMatch[1]);
      const { users } = await getCollections();
      const result = await users.findOneAndUpdate(
        { userId },
        { $set: { status } },
        { returnDocument: "after" }
      );

      if (!result) {
        sendJson(response, 404, { error: "User not found." });
        return;
      }

      sendJson(response, 200, { user: publicUser(result) });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    sendFile(response, path.join(ROOT, "index.html"));
    return;
  }

  if (
    request.method === "GET" &&
    ["/register.html", "/dashboard.html", "/voting.html", "/results.html", "/admin.html", "/styles.css", "/app.js"].includes(pathname)
  ) {
    sendFile(response, path.join(ROOT, pathname.slice(1)));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error." });
  });
});

async function startServer() {
  await connectToMongo();
  server.listen(PORT, HOST, () => {
    console.log(`Blockchain voting system running at http://${HOST}:${PORT}`);
    console.log(`MongoDB connected at ${MONGODB_URI}/${DB_NAME}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
