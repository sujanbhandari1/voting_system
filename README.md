# Blockchain Voting System

This project is a final-year-project style hybrid voting system built with plain Node.js, MongoDB, HTML, CSS, vanilla JavaScript, and a local Ethereum-compatible smart contract.

## What it currently does

- Voter registration and login
- Admin approval workflow for voters
- Election creation and start/stop controls
- One-vote-per-user enforcement
- Public result summary page
- MongoDB-backed persistent sessions
- Stronger password hashing with `scrypt`
- Real local blockchain transactions for election configuration, voting, and status changes

## Current limitations

- The blockchain layer currently runs on a local private Ganache EVM network managed by the server.
- This is still a prototype and needs additional hardening before real deployment.

## Requirements

- Node.js 18 or newer
- MongoDB running locally on `mongodb://127.0.0.1:27017`
- No separate blockchain node is required; the app starts its own local Ganache-backed chain storage

## Setup

```bash
npm install
npm start
```

The app starts at [http://127.0.0.1:3000](http://127.0.0.1:3000).
The blockchain deployment metadata and local chain database are stored under `.chain/`.

## Environment variables

```bash
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=blockchain_voting_system
NODE_ENV=development
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_MNEMONIC=test test test test test test test test test test test junk
```

`NODE_ENV=production` adds the `Secure` cookie flag for session cookies.

## Demo accounts

- Admin: `admin@college.edu` / `admin123`
- Student: `student@college.edu` / `student123`

On first successful login, legacy seeded passwords are upgraded automatically to the stronger `scrypt` format.

## Run tests

```bash
npm test
```

## Recommended next steps

1. Add explorer-style transaction and contract views in the UI.
2. Add audit logging for admin actions and vote events.
3. Add integration tests for the API routes with a test database and blockchain assertions.
4. Add rate limiting, CSRF protection, and deployment configuration.
