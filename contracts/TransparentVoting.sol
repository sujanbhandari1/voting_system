// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TransparentVoting {
    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
    }

    address public immutable admin;
    string public electionTitle;
    bool public electionActive;
    uint256 public electionNonce;

    Candidate[] private candidates;
    mapping(uint256 => uint256) private votedElectionByUser;

    event ElectionConfigured(uint256 indexed electionNonce, string title);
    event ElectionStatusChanged(uint256 indexed electionNonce, bool active);
    event VoteCast(uint256 indexed electionNonce, uint256 indexed voterId, uint256 indexed candidateId, uint256 voteCount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    constructor(address adminAddress) {
        require(adminAddress != address(0), "Invalid admin");
        admin = adminAddress;
    }

    function configureElection(
        string calldata title,
        string[] calldata names,
        string[] calldata parties
    ) external onlyAdmin {
        require(bytes(title).length > 0, "Title required");
        require(names.length >= 2, "Need candidates");
        require(names.length == parties.length, "Candidate mismatch");

        delete candidates;
        electionNonce += 1;
        electionTitle = title;
        electionActive = false;

        for (uint256 i = 0; i < names.length; i++) {
            candidates.push(
                Candidate({
                    id: i + 1,
                    name: names[i],
                    party: parties[i],
                    voteCount: 0
                })
            );
        }

        emit ElectionConfigured(electionNonce, title);
    }

    function setElectionActive(bool active) external onlyAdmin {
        require(candidates.length > 0, "Election not configured");
        electionActive = active;
        emit ElectionStatusChanged(electionNonce, active);
    }

    function castVote(uint256 voterId, uint256 candidateId) external onlyAdmin returns (uint256) {
        require(electionActive, "Voting closed");
        require(voterId > 0, "Invalid voter");
        require(candidateId > 0 && candidateId <= candidates.length, "Invalid candidate");
        require(votedElectionByUser[voterId] != electionNonce, "Already voted");

        Candidate storage candidate = candidates[candidateId - 1];
        candidate.voteCount += 1;
        votedElectionByUser[voterId] = electionNonce;

        emit VoteCast(electionNonce, voterId, candidateId, candidate.voteCount);
        return candidate.voteCount;
    }

    function hasUserVoted(uint256 voterId) external view returns (bool) {
        return votedElectionByUser[voterId] == electionNonce;
    }

    function getElection()
        external
        view
        returns (string memory title, bool active, uint256 nonce, uint256 candidateCount)
    {
        return (electionTitle, electionActive, electionNonce, candidates.length);
    }

    function getCandidate(uint256 index)
        external
        view
        returns (uint256 id, string memory name, string memory party, uint256 voteCount)
    {
        Candidate memory candidate = candidates[index];
        return (candidate.id, candidate.name, candidate.party, candidate.voteCount);
    }
}
