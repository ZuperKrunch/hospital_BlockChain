// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Public registry for wallet roles, permissions, and opaque record commitments.
/// Never submit patient information, document links, or document salts.
contract RuangSehat {
    enum Role { None, Admin, Doctor, Patient }
    struct Grant { bool enabled; uint256 patientEpoch; uint256 doctorEpoch; }
    struct Proof { bytes32 commitment; bool active; }

    address public immutable admin;
    address public publisher;
    mapping(address => Role) public roles;
    mapping(address => uint256) public roleEpoch;
    mapping(address => mapping(address => Grant)) private grants;
    mapping(bytes32 => Proof[]) private proofs;

    event RoleAssigned(address indexed wallet, Role role);
    event PermissionChanged(address indexed patient, address indexed doctor, bool enabled);
    event PublisherChanged(address indexed publisher);
    event ProofPublished(bytes32 indexed recordId, uint256 indexed version, bytes32 commitment, bool active);

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
        emit RoleAssigned(msg.sender, Role.Admin);
    }

    function assignRole(address wallet, Role role) external {
        require(msg.sender == admin, "Admin only");
        require(wallet != address(0) && wallet != admin && role != Role.Admin, "Invalid role assignment");
        require(roles[wallet] != role, "Role unchanged");
        roles[wallet] = role;
        roleEpoch[wallet]++;
        emit RoleAssigned(wallet, role);
    }

    function setPublisher(address account) external {
        require(msg.sender == admin, "Admin only");
        publisher = account; // Zero address pauses publishing.
        emit PublisherChanged(account);
    }

    function setDoctorAuthorization(address doctor, bool enabled) external {
        require(roles[msg.sender] == Role.Patient, "Patient only");
        require(doctor != address(0) && (!enabled || roles[doctor] == Role.Doctor), "Invalid doctor");
        grants[msg.sender][doctor] = Grant(enabled, roleEpoch[msg.sender], roleEpoch[doctor]);
        emit PermissionChanged(msg.sender, doctor, enabled);
    }

    function authorizedDoctors(address patient, address doctor) external view returns (bool) {
        Grant storage grant = grants[patient][doctor];
        return grant.enabled && roles[patient] == Role.Patient && roles[doctor] == Role.Doctor
            && grant.patientEpoch == roleEpoch[patient] && grant.doctorEpoch == roleEpoch[doctor];
    }

    function proofCount(bytes32 recordId) external view returns (uint256) {
        return proofs[recordId].length;
    }

    function proofAt(bytes32 recordId, uint256 version) external view returns (Proof memory) {
        require(version > 0 && version <= proofs[recordId].length, "Unknown version");
        return proofs[recordId][version - 1];
    }

    /// @dev Only the publisher can anchor commitments. Clinical access is enforced by the API.
    function publishProof(bytes32 recordId, uint256 version, bytes32 commitment, bool active) external {
        require(msg.sender == publisher, "Publisher only");
        require(recordId != bytes32(0) && commitment != bytes32(0), "Invalid proof");
        Proof[] storage history = proofs[recordId];
        require(version == history.length + 1, "Version mismatch");
        if (history.length == 0) require(active, "First version must be active");
        else require(history[history.length - 1].active, "Record closed");
        history.push(Proof(commitment, active));
        emit ProofPublished(recordId, version, commitment, active);
    }
}
