# Database Design - Three-Table Architecture

## Overview

The gift redemption system now uses a **three-table database design** to enable:
- ✅ Staff management (add/delete staff)
- ✅ Team member counting
- ✅ Redemption tracking with race condition prevention
- ✅ Atomic operations for data consistency

---

## Table Schema

### 1. All Staff Table (`all_staff`)

**Purpose:** Central registry of all staff members and their team assignments

**Storage:**
- **DynamoDB:** Table name `all_staff` (configurable via `DYNAMO_ALL_STAFF_TABLE`)
- **Local:** File `data/staff.json`

**Schema:**

| Field | Type | Key | Description |
|---|---|---|---|
| `staff_pass_id` | String | **PK** | Unique staff identifier |
| `team_name` | String | - | Team assignment (BASS, RUST, GOLANG, etc.) |
| `created_at` | Number | - | Unix timestamp when staff was added |
| `updated_at` | Number | - | Unix timestamp of last update (optional) |

**Example DynamoDB Item:**
```json
{
  "staff_pass_id": "STAFF_H123804820G",
  "team_name": "BASS",
  "created_at": 1711609800000,
  "updated_at": 1711609800000
}
```

**Example JSON File:**
```json
[
  {
    "staff_pass_id": "STAFF_H123804820G",
    "team_name": "BASS",
    "created_at": 1711609800000
  },
  {
    "staff_pass_id": "STAFF_H123804821G",
    "team_name": "RUST",
    "created_at": 1711609800000
  }
]
```

**Operations:**
- Get staff by ID: O(1) lookup
- Get all staff: Full scan
- Get staff by team: Filtered scan (requires GSI on `team_name` for DynamoDB)
- Add staff: Insert new record
- Delete staff: Remove record
- Update team: Modify `team_name` field

**DynamoDB Indexes:**
- **Primary Key:** `staff_pass_id`
- **GSI (optional):** `team_name-index` for team-based queries

---

### 2. Team Member Count Table (`team_member_count`)

**Purpose:** Maintain team member counts for fast retrieval in redemption responses

**Storage:**
- **DynamoDB:** Table name `team_member_count` (configurable via `DYNAMO_TEAM_COUNT_TABLE`)
- **Local:** File `data/team_counts.json`

**Schema:**

| Field | Type | Key | Description |
|---|---|---|---|
| `team_name` | String | **PK** | Team identifier |
| `member_count` | Number | - | Current number of members in team |
| `updated_at` | Number | - | Unix timestamp of last update |

**Example DynamoDB Item:**
```json
{
  "team_name": "BASS",
  "member_count": 5,
  "updated_at": 1711609800000
}
```

**Example JSON File:**
```json
[
  {
    "team_name": "BASS",
    "member_count": 5,
    "updated_at": 1711609800000
  },
  {
    "team_name": "RUST",
    "member_count": 3,
    "updated_at": 1711609800000
  }
]
```

**Operations:**
- Get count by team: O(1) lookup
- Get all counts: Full scan
- Increment count: Atomic update (+1)
- Decrement count: Atomic update (-1, minimum 0)
- Set count: Direct update

**When Updated:**
- **Increment:** When new staff is added to a team
- **Decrement:** When staff is deleted from a team
- **Initialize:** When team is first created

---

### 3. Redemption Status Table (`redemption_status`)

**Purpose:** Track which teams have redeemed their gifts with atomic writes for race condition prevention

**Storage:**
- **DynamoDB:** Table name `redemption_status` (configurable via `DYNAMO_REDEMPTION_STATUS_TABLE`)
- **Local:** File `data/redemptions.json`

**Schema:**

| Field | Type | Key | Description |
|---|---|---|---|
| `team_name` | String | **PK** | Team identifier |
| `staff_pass_id` | String | - | Which staff member made the redemption |
| `redeemed_at` | Number | - | Unix timestamp when redeemed |

**Example DynamoDB Item:**
```json
{
  "team_name": "BASS",
  "staff_pass_id": "STAFF_H123804820G",
  "redeemed_at": 1711609800000
}
```

**Example JSON File:**
```json
[
  {
    "team_name": "BASS",
    "staff_pass_id": "STAFF_H123804820G",
    "redeemed_at": 1711609800000
  }
]
```

**Operations:**
- Get redemption by team: O(1) lookup
- Get all redemptions: Full scan
- Get redemption by staff: Filtered scan
- Create redemption: Insert with atomic condition (`attribute_not_exists(team_name)`)
- Delete redemption: Remove record

**Atomic Write Protection:**
```
ConditionExpression: 'attribute_not_exists(team_name)'
```
This ensures only ONE redemption per team can ever be recorded.

---

## Redemption Flow (Three-Table Query)

### Request: POST /redeem

```
Input: { staff_pass_id: "STAFF_H123804820G" }

Step 1: Query AllStaffsTable
  - Lookup staff by staff_pass_id
  - Get team_name from result
  - Return: throws NotFoundError if not found

Step 2: Query RedemptionStatusTable
  - Check if team already has a redemption
  - Return: throws ConflictError if exists

Step 3: Write to RedemptionStatusTable (ATOMIC)
  - Insert redemption record
  - Use ConditionExpression to prevent race conditions
  - Return: throws ConflictError if already exists (race condition)

Step 4: Query TeamMemberCountTable
  - Get member_count for the team
  - Return: 0 if no record exists

Step 5: Response
  {
    status: "SUCCESS",
    team: "BASS",
    team_member_count: 5,
    requestId: "uuid",
    timestamp: "2024-03-28T..."
  }
```

---

## Staff Management Flow

### Add Staff: POST /staff

```
Input: { staff_pass_id: "NEWSTAFF001", team_name: "BASS" }

Step 1: Write to AllStaffTable
  - Add staff_pass_id, team_name, created_at
  - Prevent duplicate: attribute_not_exists(staff_pass_id)

Step 2: Update TeamMemberCountTable
  - Increment member_count for team
  - If team count doesn't exist, initialize it

Response:
  {
    status: "SUCCESS",
    staff_pass_id: "NEWSTAFF001",
    team_name: "BASS",
    timestamp: "..."
  }
```

### Delete Staff: DELETE /staff/{staff_pass_id}

```
Input: staff_pass_id: "NEWSTAFF001"

Step 1: Query AllStaffTable
  - Get staff record
  - Extract team_name

Step 2: Check RedemptionStatusTable
  - Query for this staff_pass_id
  - If exists:
    → Return 206 PARTIAL with redemption record
    → DON'T delete (prevent orphaned redemptions)

Step 3: Delete from AllStaffTable
  - Remove staff record

Step 4: Update TeamMemberCountTable
  - Decrement member_count for team

Response (success):
  {
    status: "SUCCESS",
    message: "Staff deleted successfully"
  }

Response (has redemption):
  {
    status: "DELETE_PARTIAL",
    message: "Staff has redemption record and cannot be deleted",
    redemption: { team_name, staff_pass_id, redeemed_at }
  }
```

---

## Data Consistency Guarantees

### 1. Atomic Writes

**Specification:** Only one redemption per team
```
DynamoDB ConditionExpression: 'attribute_not_exists(team_name)'
```
- **Benefits:** Prevents race conditions from concurrent requests
- **Mechanism:** Fails if team_name already exists
- **Error Code:** `ConditionalCheckFailedException`

### 2. Member Count Consistency

**Spec:** Member count = number of staff in team (eventually)
- **Updated:** When staff added/deleted
- **Verified:** Via GET /staff/team/:team endpoint
- **Mechanism:** Atomic increment/decrement operations

### 3. Referential Integrity

**Spec:** Prevent orphaned data
- **Staff → Team:** Staff must belong to valid team
- **Redemption → Staff:** Redemption references staff via team
- **Protection:** DELETE /staff prevents deletion if redemption exists

---

## Local Storage Format

### staff.json
```json
[
  { "staff_pass_id": "...", "team_name": "...", "created_at": 1234567890 },
  ...
]
```
- **In-Memory Structure:** Array of objects
- **Lookup Time:** O(n) linear scan
- **Update Strategy:** Read all, modify, write all
- **Persistence:** Uses `fs.promises` for async I/O

### team_counts.json
```json
[
  { "team_name": "...", "member_count": 5, "updated_at": 1234567890 },
  ...
]
```
- **In-Memory Structure:** Array of objects
- **Internal Cache:** Object map {teamName → count}
- **Lookup Time:** O(1) from cache Object

### redemptions.json
```json
[
  { "team_name": "...", "staff_pass_id": "...", "redeemed_at": 1234567890 },
  ...
]
```
- **In-Memory Structure:** Array of objects
- **Internal Cache:** Object map {teamName → record}
- **Lookup Time:** O(1) from cache Object

---

## DynamoDB Configuration

### Table 1: all_staff

```
TableName: all_staff

PrimaryKey:
  PartitionKey: staff_pass_id (String)

GlobalSecondaryIndex (GSI):
  IndexName: team_name-index
  PartitionKey: team_name (String)
  Projection: ALL

BillingMode: PAY_PER_REQUEST (or provisioned capacity)

TTL: None (staff records are permanent until deleted)
```

### Table 2: team_member_count

```
TableName: team_member_count

PrimaryKey:
  PartitionKey: team_name (String)

BillingMode: PAY_PER_REQUEST

TTL: None (persistent team data)

StreamSpecification: ENABLED (optional, for audit)
```

### Table 3: redemption_status

```
TableName: redemption_status

PrimaryKey:
  PartitionKey: team_name (String)

BillingMode: PAY_PER_REQUEST

TTL: Optional for auto-expiry (e.g., 90 days)
  - Set on: redeemed_at attribute
  - Useful for: Quarterly gift redemptions

StreamSpecification: ENABLED (optional, for audit log)

ConditionExpression: ENFORCED for createRedemption
  - Ensures atomic writes
  - Prevents race conditions
  - Works correctly under concurrent load
```

---

## Migration from Old Design

### Old Design (Single Table)
```
redemptions.json: ["TEAM_A", "TEAM_B", "BASS", "RUST"]
staff.csv: CSV file with staff mappings
```

### New Design (Three Tables)
```
staff.json: [{ staff_pass_id, team_name, created_at }, ...]
team_counts.json: [{ team_name, member_count, updated_at }, ...]
redemptions.json: [{ team_name, staff_pass_id, redeemed_at }, ...]
```

### Migration Script (Pseudo-code)
```javascript
// 1. Load all staff from CSV
const staffData = loadCSV('data/staff.csv');

// 2. Group by team and count
const teamCounts = {};
staffData.forEach(staff => {
  if (!teamCounts[staff.team]) teamCounts[staff.team] = 0;
  teamCounts[staff.team]++;
});

// 3. Write to new files
fs.writeFile('staff.json', JSON.stringify(staffData, null, 2));
fs.writeFile('team_counts.json', JSON.stringify(teamCounts, null, 2));
fs.writeFile('redemptions.json', JSON.stringify([], null, 2));
```

---

## Performance Characteristics

### Read Performance

| Operation | Local Storage | DynamoDB | Time |
|---|---|---|---|
| Get staff by ID | O(n) scan | O(1) with PK | 1-10ms / <5ms |
| Get all staff | O(n) | O(n) scan | 10-100ms / 100-500ms |
| Get staff by team | O(n) filter | O(n) with GSI | 10-100ms / 100-500ms |
| Get member count | O(1) cache | O(1) with PK | <1ms / <5ms |
| Check redemption | O(1) cache | O(1) with PK | <1ms / <5ms |

### Write Performance

| Operation | Local Storage | DynamoDB | Time |
|---|---|---|---|
| Add staff | O(n) + file I/O | O(1) | 10-50ms / 5-20ms |
| Delete staff | O(n) + file I/O | O(1) | 10-50ms / 5-20ms |
| Create redemption | O(n) + file I/O | O(1) atomic | 10-50ms / 5-20ms |
| Increment count | O(1) + file I/O | O(1) | 10-50ms / 5-20ms |

---

## Concurrent Request Handling

### Test Case: Two simultaneous redemption attempts for same team

```
Request 1: redeem(STAFF_001, team=BASS)
Request 2: redeem(STAFF_002, team=BASS)

Timeline:
T0: Both queries verify team not redeemed → Both get false

T1: Request 1 writes to redemption table
    ConditionExpression: attribute_not_exists(team_name)
    Result: SUCCESS - record inserted

T2: Request 2 writes to redemption table
    ConditionExpression: attribute_not_exists(team_name)
    Result: FAIL - ConditionalCheckFailedException
    
Response:
  Request 1: 200 SUCCESS with team_member_count
  Request 2: 409 CONFLICT "already redeemed"
```

**Mechanism:** Atomic conditional write prevents race condition

---

## Environment Variables

```bash
# Storage mode
STORAGE_MODE=local|dynamo

# DynamoDB configuration
DYNAMO_ALL_STAFF_TABLE=all_staff
DYNAMO_TEAM_COUNT_TABLE=team_member_count
DYNAMO_REDEMPTION_STATUS_TABLE=redemption_status
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Retry configuration
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=100
RETRY_MAX_DELAY_MS=5000
```

---

## Monitoring & Maintenance

### Metrics to Track

1. **Staff Management:**
   - Total staff count (per team)
   - Staffjoining rate (new hires)
   - Staff deletion frequency
   
2. **Redemption:**
   - Redemption rate (teams redeemed / total teams)
   - Average time to redeem
   - Concurrent request count
   
3. **Database:**
   - Table size (rows for each table)
   - Operation latency (read/write)
   - Error rates (especially ConditionalCheckFailedException)

### Data Validation

```sql
-- Verify consistency (pseudo-SQL)
SELECT team_name, COUNT(*) as staff_count
FROM all_staff
GROUP BY team_name;
-- Should match: SELECT team_name, member_count FROM team_member_count

-- Verify referential integrity
SELECT * FROM redemption_status r
WHERE NOT EXISTS (
  SELECT 1 FROM all_staff s
  WHERE s.team_name = r.team_name
);
-- Should return empty result
```

---

## See Also

- [API Reference](./API_REFERENCE.md) - All endpoints
- [README](./README.md) - Getting started
- [Three-Table Design Tests](../test/three-table-design.test.js) - Test suite with 50+ cases
