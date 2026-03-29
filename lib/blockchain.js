const fs = require("fs");
const path = require("path");
const ganache = require("ganache");
const solc = require("solc");
const { ethers } = require("ethers");

const CONTRACT_NAME = "TransparentVoting";
const DEPLOYMENT_FILE = path.join(__dirname, "..", ".chain", "deployment.json");
const GANACHE_DB_PATH = path.join(__dirname, "..", ".chain", "ganache-db");
const CONTRACT_FILE = path.join(__dirname, "..", "contracts", "TransparentVoting.sol");
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

let browserProvider;
let adminSigner;
let votingContract;

function ensureChainDir() {
  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
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

async function initializeBlockchain() {
  await ensureContract();
}

async function getContractInfo() {
  const contract = await ensureContract();
  const provider = await buildProvider();
  const network = await provider.getNetwork();

  return {
    address: await contract.getAddress(),
    chainId: Number(network.chainId),
    network: "Local Ganache EVM"
  };
}

async function configureElection(election) {
  const contract = await ensureContract();
  const candidateNames = election.candidates.map((candidate) => candidate.name);
  const candidateParties = election.candidates.map((candidate) => candidate.party || "");
  const tx = await contract.configureElection(election.title, candidateNames, candidateParties);
  const receipt = await tx.wait();

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber
  };
}

async function setElectionActive(active) {
  const contract = await ensureContract();
  const tx = await contract.setElectionActive(active);
  const receipt = await tx.wait();

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber
  };
}

async function castVote({ userId, candidateId }) {
  const contract = await ensureContract();
  const tx = await contract.castVote(userId, candidateId);
  const receipt = await tx.wait();

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber
  };
}

async function getElectionState() {
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
}

async function hasUserVoted(userId) {
  const contract = await ensureContract();
  return contract.hasUserVoted(userId);
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
