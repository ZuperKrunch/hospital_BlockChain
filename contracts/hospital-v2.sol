// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Classroom testnet prototype. Medical data is PUBLIC on-chain.
/// Use fictional patients only. Access checks are application rules, not encryption.
contract MedicalRecordSystem {
    enum Role { None, Admin, Doctor, Patient }
    struct MedicalData {
        string patientName;
        string birthDate;
        string gender;
        string bloodType;
        uint16 heightCmX10; // 1705 = 170.5 cm; zero = not measured
        uint16 weightKgX10; // 652 = 65.2 kg; zero = not measured
        string medicalHistory;
        string allergies;
        string complaint;
        string diagnosis;
        string medications;
        string notes;
    }
    struct Record {
        MedicalData data;
        uint256 createdAt;
        uint256 updatedAt;
        address doctor;
        bool isActive;
    }
    struct Authorization {
        bool enabled;
        uint256 patientEpoch;
        uint256 doctorEpoch;
    }
    address public immutable admin;
    mapping(address => Role) public roles;
    mapping(address => uint256) public roleEpoch;
    mapping(address => mapping(address => Authorization)) private authorizations;
    mapping(address => Record[]) private patientRecords;

    event RoleAssigned(address indexed account, Role previousRole, Role newRole);
    event DoctorAuthorizationChanged(address indexed patient, address indexed doctor, bool authorized);
    event RecordAdded(address indexed patient, address indexed doctor, uint256 indexed recordId);
    event RecordUpdated(address indexed patient, address indexed doctor, uint256 indexed recordId);
    event RecordDeleted(address indexed patient, address indexed doctor, uint256 indexed recordId);

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
        emit RoleAssigned(msg.sender, Role.None, Role.Admin);
    }
    function schemaVersion() external pure returns (uint256) { return 2; }
    function assignRole(address account, Role newRole) external {
        require(msg.sender == admin, "Admin only");
        require(account != address(0) && account != admin, "Invalid account");
        require(newRole != Role.Admin, "Single immutable admin");
        Role previous = roles[account];
        require(previous != newRole, "Role unchanged");
        roles[account] = newRole;
        roleEpoch[account]++;
        emit RoleAssigned(account, previous, newRole);
    }
    function authorizedDoctors(address patient, address doctor) public view returns (bool) {
        Authorization storage a = authorizations[patient][doctor];
        return roles[patient] == Role.Patient && roles[doctor] == Role.Doctor && a.enabled
            && a.patientEpoch == roleEpoch[patient] && a.doctorEpoch == roleEpoch[doctor];
    }
    function setDoctorAuthorization(address doctor, bool status) external {
        require(roles[msg.sender] == Role.Patient, "Patient only");
        require(doctor != address(0), "Invalid doctor");
        if (status) require(roles[doctor] == Role.Doctor, "Doctor only");
        authorizations[msg.sender][doctor] = Authorization(status, roleEpoch[msg.sender], roleEpoch[doctor]);
        emit DoctorAuthorizationChanged(msg.sender, doctor, status);
    }
    function _requireDoctor(address patient) private view {
        require(authorizedDoctors(patient, msg.sender), "Doctor not authorized");
    }
    function _requireReader(address patient) private view {
        require(roles[patient] == Role.Patient, "Invalid patient");
        require(msg.sender == patient || authorizedDoctors(patient, msg.sender), "Access denied");
    }
    function _validate(MedicalData calldata d) private pure {
        require(bytes(d.patientName).length > 0 && bytes(d.patientName).length <= 120, "Invalid patient name");
        require(bytes(d.birthDate).length == 0 || bytes(d.birthDate).length == 10, "Invalid birth date length");
        require(bytes(d.gender).length <= 40 && bytes(d.bloodType).length <= 20, "Invalid demographics");
        require(d.heightCmX10 <= 3000 && d.weightKgX10 <= 7000, "Measurement out of range");
        require(bytes(d.medicalHistory).length <= 1000 && bytes(d.allergies).length <= 1000, "History too long");
        require(bytes(d.complaint).length <= 1000, "Complaint too long");
        require(bytes(d.diagnosis).length > 0 && bytes(d.diagnosis).length <= 1000, "Invalid diagnosis");
        require(bytes(d.medications).length <= 1000 && bytes(d.notes).length <= 2000, "Notes too long");
    }
    function addRecord(address patient, MedicalData calldata data) external {
        _requireDoctor(patient);
        _validate(data);
        uint256 id = patientRecords[patient].length;
        patientRecords[patient].push(Record(data, block.timestamp, block.timestamp, msg.sender, true));
        emit RecordAdded(patient, msg.sender, id);
    }
    function updateRecord(address patient, uint256 recordId, MedicalData calldata data) external {
        _requireDoctor(patient);
        require(recordId < patientRecords[patient].length, "Record not found");
        Record storage r = patientRecords[patient][recordId];
        require(r.doctor == msg.sender, "Record author only");
        require(r.isActive, "Record inactive");
        _validate(data);
        r.data = data;
        r.updatedAt = block.timestamp;
        emit RecordUpdated(patient, msg.sender, recordId);
    }
    /// @notice Soft delete; previous data and transaction history remain public.
    function deleteRecord(address patient, uint256 recordId) external {
        _requireDoctor(patient);
        require(recordId < patientRecords[patient].length, "Record not found");
        Record storage r = patientRecords[patient][recordId];
        require(r.doctor == msg.sender, "Record author only");
        require(r.isActive, "Record inactive");
        r.isActive = false;
        r.updatedAt = block.timestamp;
        emit RecordDeleted(patient, msg.sender, recordId);
    }
    function getRecordCount(address patient) external view returns (uint256) {
        _requireReader(patient);
        return patientRecords[patient].length;
    }
    function getRecordsPage(address patient, uint256 offset, uint256 limit) external view returns (Record[] memory page) {
        _requireReader(patient);
        require(limit > 0 && limit <= 20, "Page size 1-20");
        uint256 count = patientRecords[patient].length;
        if (offset >= count) return new Record[](0);
        uint256 size = count - offset;
        if (size > limit) size = limit;
        page = new Record[](size);
        for (uint256 i; i < size; i++) page[i] = patientRecords[patient][offset + i];
    }
}
