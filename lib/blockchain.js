const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

const CONTRACT_NAME = "TransparentVoting";
const CHAIN_DIR = path.join(__dirname, "..", ".chain");
const DEPLOYMENT_FILE = path.join(CHAIN_DIR, "deployment.json");
const GANACHE_DB_PATH = path.join(CHAIN_DIR, "ganache-db");
const MOCK_STATE_FILE = path.join(CHAIN_DIR, "mock-state.json");
const CONTRACT_FILE = path.join(__dirname, "..", "contracts", "TransparentVoting.sol");
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

let browserProvider;
let adminSigner;
let votingContract;
let runtimeMode = process.env.BLOCKCHAIN_MODE === "ganache" ? "ganache" : "mock";

function ensureChainDir() {
  fs.mkdirSync(CHAIN_DIR, { recursive: true });
}

function buildTransaction() {
  return {
    hash: `0x${crypto.randomBytes(32).toString("hex")}`,
    blockNumber: Date.now()
  };
}

function defaultMockState() {
  return {
    mode: "mock",
    address: `0x${"1".repeat(40)}`,
    chainId: Number(process.env.BLOCKCHAIN_CHAIN_ID || 1337),
    electionTitle: "",
    electionActive: false,
    electionNonce: 0,
    candidates: [],
    votedElectionByUser: {}
  };
}

function readMockState() {
  ensureChainDir();
  if (!fs.existsSync(MOCK_STATE_FILE)) {
    const state = defaultMockState();
    fs.writeFileSync(MOCK_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  return JSON.parse(fs.readFileSync(MOCK_STATE_FILE, "utf8"));
}

function writeMockState(state) {
  ensureChainDir();
  fs.writeFileSync(MOCK_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function compileContract() {
  const source = fs.readFileSync(CONTRACT_FILE, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [path.basename(CONTRACT_FILE)]: {
        content: source
      }
    },
    settings: {
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatalErrors = output.errors.filter((entry) => entry.severity === "error");
    if (fatalErrors.length > 0) {
      throw new Error(fatalErrors.map((entry) => entry.formattedMessage).join("\n"));
    }
  }

  const contract = output.contracts[path.basename(CONTRACT_FILE)][CONTRACT_NAME];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  };
}

function readDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

function writeDeployment(payload) {
  ensureChainDir();
  fs.writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

async function buildProvider() {
  if (browserProvider) {
    return browserProvider;
  }

  const ganache = require("ganache");

  ensureChainDir();

  const provider = ganache.provider({
    wallet: {
      mnemonic: process.env.BLOCKCHAIN_MNEMONIC || DEFAULT_MNEMONIC,
      totalAccounts: 5
    },
    chain: {
      chainId: Number(process.env.BLOCKCHAIN_CHAIN_ID || 1337)
    },
    database: {
      dbPath: GANACHE_DB_PATH
    },
    logging: {
      quiet: true
    }
  });

  browserProvider = new ethers.BrowserProvider(provider);
  adminSigner = await browserProvider.getSigner(0);
  return browserProvider;
}

async function ensureContract() {
  if (votingContract) {
    return votingContract;
  }

  await buildProvider();
  const { abi, bytecode } = compileContract();
  const deployment = readDeployment();

  if (deployment && deployment.address) {
    const code = await browserProvider.getCode(deployment.address);
    if (code && code !== "0x") {
      votingContract = new ethers.Contract(deployment.address, abi, adminSigner);
      return votingContract;
    }
  }

  const factory = new ethers.ContractFactory(abi, bytecode, adminSigner);
  const contract = await factory.deploy(await adminSigner.getAddress());
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  const network = await browserProvider.getNetwork();

  writeDeployment({
    address: deployedAddress,
    chainId: Number(network.chainId)
  });

  votingContract = contract;
  return votingContract;
}

async function ensureGanacheReady() {
  await ensureContract();
  runtimeMode = "ganache";
}

async function withFallback(action, fallbackAction) {
  if (runtimeMode === "mock") {
    return fallbackAction();
  }

  try {
    return await action();
  } catch (error) {
    runtimeMode = "mock";
    console.warn("Blockchain fallback activated:", error.message);
    return fallbackAction();
  }
}

async function initializeBlockchain() {
  return withFallback(
    async () => {
      await ensureGanacheReady();
    },
    async () => {
      writeMockState(readMockState());
    }
  );
}

async function getContractInfo() {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      const provider = await buildProvider();
      const network = await provider.getNetwork();

      return {
        address: await contract.getAddress(),
        chainId: Number(network.chainId),
        network: "Local Ganache EVM"
      };
    },
    async () => {
      const state = readMockState();
      return {
        address: state.address,
        chainId: state.chainId,
        network: "Mock local chain"
      };
    }
  );
}

async function configureElection(election) {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      const candidateNames = election.candidates.map((candidate) => candidate.name);
      const candidateParties = election.candidates.map((candidate) => candidate.party || "");
      const tx = await contract.configureElection(election.title, candidateNames, candidateParties);
      const receipt = await tx.wait();

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    },
    async () => {
      const state = readMockState();
      state.electionTitle = election.title;
      state.electionActive = false;
      state.electionNonce += 1;
      state.candidates = election.candidates.map((candidate, index) => ({
        candidateId: index + 1,
        name: candidate.name,
        party: candidate.party || "",
        votes: 0
      }));
      writeMockState(state);
      return buildTransaction();
    }
  );
}

async function setElectionActive(active) {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      const tx = await contract.setElectionActive(active);
      const receipt = await tx.wait();

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    },
    async () => {
      const state = readMockState();
      if (!state.candidates.length) {
        throw new Error("Election not configured");
      }
      state.electionActive = active;
      writeMockState(state);
      return buildTransaction();
    }
  );
}

async function castVote({ userId, candidateId }) {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      const tx = await contract.castVote(userId, candidateId);
      const receipt = await tx.wait();

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    },
    async () => {
      const state = readMockState();
      if (!state.electionActive) {
        throw new Error("Voting closed");
      }
      if (state.votedElectionByUser[String(userId)] === state.electionNonce) {
        throw new Error("Already voted");
      }

      const candidate = state.candidates.find((entry) => entry.candidateId === candidateId);
      if (!candidate) {
        throw new Error("Invalid candidate");
      }

      candidate.votes += 1;
      state.votedElectionByUser[String(userId)] = state.electionNonce;
      writeMockState(state);
      return buildTransaction();
    }
  );
}

async function getElectionState() {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      const [title, active, nonce, candidateCount] = await contract.getElection();
      const candidates = [];

      for (let index = 0; index < Number(candidateCount); index += 1) {
        const candidate = await contract.getCandidate(index);
        candidates.push({
          candidateId: Number(candidate[0]),
          name: candidate[1],
          party: candidate[2],
          votes: Number(candidate[3])
        });
      }

      return {
        title,
        active,
        nonce: Number(nonce),
        candidates
      };
    },
    async () => {
      const state = readMockState();
      return {
        title: state.electionTitle,
        active: state.electionActive,
        nonce: state.electionNonce,
        candidates: state.candidates
      };
    }
  );
}

async function hasUserVoted(userId) {
  return withFallback(
    async () => {
      const contract = await ensureContract();
      return contract.hasUserVoted(userId);
    },
    async () => {
      const state = readMockState();
      return state.votedElectionByUser[String(userId)] === state.electionNonce;
    }
  );
}

module.exports = {
  castVote,
  configureElection,
  getContractInfo,
  getElectionState,
  hasUserVoted,
  initializeBlockchain,
  setElectionActive
};
