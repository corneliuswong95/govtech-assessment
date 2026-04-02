# Gift Redemption System

A robust gift redemption service built with Express.js, featuring comprehensive input validation, error recovery, race condition handling, and support for multiple storage backends (Local JSON and DynamoDB).

## Project Development

### Architecture & Design by Me | Implementation with AI Assistance

**Development Split:**
- **Architecture & Design**: Conceived and designed entirely by me - defining the three-table structure, pre-processed collections, atomic write patterns, and overall system design using Amazon web services (AWS).
- **Implementation**: Executed with AI assistance - code generation, testing, documentation, and refinement
- **Quality Assurance**: Comprehensive testing (75+ test cases), syntax verification, and production readiness review

This project demonstrates the complementary strengths: **Human design thinking** paired with **AI implementation efficiency**. The architectural decisions reflect real-world concerns (race conditions, performance, scalability), while AI handled the repetitive coding tasks, allowing focus on what matters most - the design.

**The core architectural decisions and design patterns** that drive this system are the result of my thoughtful product engineering:

#### Core Design Contributions

**1. Three-Table Database Design for Race-Condition Prevention & Fast Team Member Lookup**
- The redemption system uses a three-table architecture (all_staff, team_member_count, redemption_status):
  - **all_staff**: Staff registry with team assignments
  - **team_member_count**: Pre-calculated member counts per team (enables O(1) instant lookup)
  - **redemption_status**: Tracks redeemed teams with atomic writes
- This eliminates expensive table scans - instead of querying the staff table and counting members, the team_member_count table provides instant access to member counts
- Prevents double redemptions via atomic conditional writes - only one redemption per team can succeed, even under concurrent requests from multiple staff members
- The conditional write pattern `ConditionExpression: 'attribute_not_exists(team_name)'` guarantees atomicity without distributed locks

**2. Pre-processed Staff Collections & Dedicated Team Count Table for Real-Time Performance**
- A separate **`team_member_count` table is pre-calculated and maintained**, storing cached member counts per team
- This design eliminates need for expensive COUNT() or table scan operations during redemption - just a single key lookup in team_member_count table
- Allows instant retrieval of team size during redemption requests - critical for determining voucher/coupon inventory allocation
- Instead of calculating member counts on-the-fly (which would require scanning all staff records), the system performs a direct O(1) lookup to immediately determine team size and available resources

**3. Separation of Concerns**
- Staff Management Service handles lifecycle (add, delete, update teams)
- Redemption Service orchestrates the multi-table query pattern
- Each repository is independently testable and swappable (local or DynamoDB)

These architectural decisions prioritize **data integrity**, **performance**, and **scalability** for production gift redemption workflows.

## Features

✅ **Input Validation** - Request validation middleware with detailed error messages  
✅ **Error Handling** - Custom error types mapped to proper HTTP status codes  
✅ **Race Condition Safety** - Atomic conditional writes in DynamoDB  
✅ **Retry Logic** - Exponential backoff for transient failures  
✅ **Request Tracing** - Unique request IDs for all requests  
✅ **Async/Await** - Fully async operations with proper error propagation  
✅ **Logging** - Structured JSON logging with context (Winston)  
✅ **Multiple Storage Backends** - Local file storage (dev) or DynamoDB (production)  
✅ **Comprehensive Tests** - Unit, integration, and concurrency tests  
✅ **Configuration Management** - Environment-based config with validation  

## Architecture

```
Request
  ↓
Request ID Middleware (adds ~request-id + x-request-id header)
  ↓
Validation Middleware (input validation)
  ↓
Route Handler (async)
  ↓
RedemptionService (business logic)
  ├── StaffMappingRepository (validate staff exists)
  └── RedemptionRepository (create redemption with duplicate check)
         ├── DynamoRedemptionRepository (atomic conditional write + retry)
         └── LocalRedemptionRepository (file-based with async I/O)
  ↓
Error Handler Middleware (maps errors to HTTP status codes)
  ↓
Response (with request ID, status code, body)
```

## Quick Start

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` for your configuration:

```env
NODE_ENV=development
STORAGE_MODE=local          # or 'dynamo' for production
PORT=3000
LOG_LEVEL=info
```

### Run Server

```bash
npm start
```

Server starts on `http://localhost:3000`

### Run Tests

```bash
npm test
```

Tests include validation, service logic, repository, retry logic, integration, and concurrency tests.

## API Reference

### POST /redeem

Redeem a gift for a staff member.

**Request:**
```json
{
  "staff_pass_id": "STAFF_H123804820G"
}
```

**Successful Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "team": "BASS",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```

**Duplicate Redemption (409 Conflict):**
```json
{
  "status": "FAILED",
  "code": "ALREADY_REDEEMED",
  "message": "Team has already been redeemed",
  "reason": "Team \"BASS\" has already been redeemed",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```
Header: `Retry-After: 5`

**Invalid Staff ID (400 Bad Request):**
```json
{
  "status": "FAILED",
  "code": "INVALID_STAFF",
  "message": "Staff ID not found",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```

**Validation Error (400 Bad Request):**
```json
{
  "status": "FAILED",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "staff_pass_id",
      "message": "staff_pass_id is required",
      "value": ""
    }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```

**Server Error (500 Internal Server Error):**
```json
{
  "status": "FAILED",
  "code": "INTERNAL_ERROR",
  "message": "Failed to save redemption to database: ...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```

### GET /health

Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2026-03-28T10:30:00.000Z",
  "mode": "local"
}
```

## Error Codes & HTTP Status

| HTTP Status | Code | Scenario | Recovery |
|---|---|---|---|
| **200** | OK | Redemption successful | N/A |
| **400** | VALIDATION_ERROR | Input validation failed | Fix request fields |
| **400** | INVALID_STAFF | Staff ID not found | Use valid staff ID |
| **409** | ALREADY_REDEEMED | Team already redeemed | Wait (see Retry-After header), cannot redeem same team twice |
| **500** | INTERNAL_ERROR | Database/server error | Automatic retry with exponential backoff |
| **503** | SERVICE_UNAVAILABLE | Database unavailable | Automatic retry with exponential backoff |

## Redemption Scenarios

### ✅ Scenario 1: Valid Redemption

```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}'
```

**Expected**: 200 OK, `status: SUCCESS`, team returned

### ✅ Scenario 2: Invalid Staff ID

```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "INVALID_STAFF"}'
```

**Expected**: 400 Bad Request, `code: INVALID_STAFF`

### ✅ Scenario 3: Duplicate Redemption

```bash
# First request
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}'
# Response: 200 OK

# Second request (same staff)
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}'
```

**Expected**: 409 Conflict, `code: ALREADY_REDEEMED`, header: `Retry-After: 5`

### ✅ Scenario 4: Empty Input

```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": ""}'
```

**Expected**: 400 Bad Request, `code: VALIDATION_ERROR`, details with field errors

### ✅ Scenario 5: Missing Field

```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected**: 400 Bad Request, `code: VALIDATION_ERROR`

### ✅ Scenario 6: Concurrent Requests (Race Condition)

```bash
# Fire two simultaneous requests for same staff
curl -X POST http://localhost:3000/redeem -d '{"staff_pass_id":"STAFF_H123804820G"}' & \
curl -X POST http://localhost:3000/redeem -d '{"staff_pass_id":"STAFF_H123804820G"}'
```

**Expected (DynamoDB)**: One 200 OK, one 409 Conflict (atomic write prevents duplicates)  
**Expected (Local)**: Depends on timing, but service handles gracefully

### ✅ Scenario 7: Retry on Transient Failure

When DynamoDB is throttled or temporarily unavailable:
- 1st attempt fails with `ThrottlingException`
- System waits 100ms (configurable)
- 2nd attempt fails with...
- System waits 200ms (exponential backoff)
- 3rd attempt succeeds

**Expected**: Request succeeds after retries (transparent to client)

## Input Validation Rules

| Field | Rules |
|---|---|
| `staff_pass_id` | • Required (non-empty) • Max 100 characters • Trimmed whitespace |

## Configuration

### Environment Variables

Create `.env` file (or use system environment variables):

```env
# Application
NODE_ENV=development              # development, production, test
PORT=3000                          # Server port
HOST=localhost                     # Listen host

# Storage
STORAGE_MODE=local                 # 'local' (dev) or 'dynamo' (prod)
REDEMPTIONS_FILE_PATH=./data/redemptions.json
DYNAMO_TABLE=redemptions           # DynamoDB table name
AWS_REGION=us-east-1               # AWS region
AWS_ACCESS_KEY_ID=<your-key>       # AWS credentials (if not using IAM role)
AWS_SECRET_ACCESS_KEY=<your-secret>

# Staff Data
STAFF_CSV_PATH=./data/staff.csv

# Logging
LOG_LEVEL=info                     # debug, info, warn, error
LOG_FORMAT=json                    # json or simple

# Retry
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=100
RETRY_MAX_DELAY_MS=5000
RETRY_BACKOFF_MULTIPLIER=2
```

See `.env.example` for full template.

## Data Files

### data/staff.csv

Staff-to-team mapping:

```csv
staff_pass_id,team_name,created_at
STAFF_H123804820G,BASS,1623772799000
MANAGER_T999888420B,RUST,1623772799000
BOSS_T000000001P,RUST,1623872111000
```

### data/redemptions.json

Tracks redeemed teams (created automatically):

```json
["BASS", "RUST"]
```

### DynamoDB Schema

Table: `redemptions` (partition key: `team_name`)

| Attribute | Type | Description |
|---|---|---|
| `team_name` | String (PK) | Team that was redeemed |
| `staff_pass_id` | String | Staff member who redeemed (audit trail) |
| `redeemed_at` | Number | Unix timestamp of redemption |

**Atomic Write**: Conditional expression `attribute_not_exists(team_name)` ensures only one redemption per team, prevents race conditions.

## Storage Modes

### Local Mode (Development)

- File-based storage: `data/redemptions.json`
- In-memory Set for O(1) duplicate detection
- Async file I/O with `fs.promises`
- Suitable for: Development, testing, small datasets
- ⚠️ Warning: Not recommended for production (no distributed locking, single-instance only)

### DynamoDB Mode (Production)

- AWS DynamoDB table storage
- Atomic conditional writes (prevents race conditions without locking)
- Exponential backoff retry for transient failures
- Scales to millions of requests
- Recommended for: Production deployments

## Logging

All requests and errors are logged with structured JSON format:

**Successful Redemption:**
```json
{
  "level": "info",
  "message": "Redemption successful",
  "timestamp": "2026-03-28T10:30:00.000Z",
  "staffPassId": "STAFF_H123804820G",
  "team": "BASS"
}
```

**Duplicate Attempt:**
```json
{
  "level": "info",
  "message": "Duplicate redemption attempt",
  "timestamp": "2026-03-28T10:30:00.000Z",
  "staffPassId": "STAFF_H123804820G",
  "team": "BASS"
}
```

**Retry:**
```json
{
  "level": "warn",
  "message": "DynamoDB createRedemption for team: BASS failed (attempt 1/3), retrying in 105ms",
  "timestamp": "2026-03-28T10:30:00.000Z",
  "errorCode": "ThrottlingException"
}
```

## Testing

### Run All Tests

```bash
npm test
```

### Test Categories

- ✅ **Validation Tests**: Empty input, missing fields, invalid format
- ✅ **Error Type Tests**: Verify error classes and status codes
- ✅ **Service Tests**: Business logic with mocks
- ✅ **Repository Tests**: File I/O and DynamoDB operations
- ✅ **Retry Tests**: Backoff logic and transient error handling
- ✅ **Integration Tests**: Full request flow
- ✅ **Concurrency Tests**: Race conditions

### Running Specific Test Suites

```bash
npm test -- --testNamePattern="Validation Middleware"
npm test -- --testNamePattern="Retry Logic"
npm test -- --coverage
```

## Performance

- **Concurrent Requests**: DynamoDB can handle thousands (mutable based on provisioned capacity)
- **Staff Lookup**: O(1) - in-memory Map
- **Duplicate Detection**: O(1) - DynamoDB partition key or in-memory Set
- **Retry Overhead**: ~100-200ms per retry (exponential backoff)

## Security

- ✅ Input validation prevents injection attacks
- ✅ Error messages don't leak sensitive system info
- ✅ Request IDs enable audit trails
- ✅ AWS SDK credentials via environment variables (never hardcoded)
- ⚠️  Production: Use IAM roles instead of access keys

## File Structure

```
.
├── src/
│   ├── app.js                          # Express app, routes, middleware setup
│   ├── services/
│   │   └── redemptionService.js        # Business logic, orchestrates repos
│   ├── repositories/
│   │   ├── staffMappingRepository.js   # CSV staff data
│   │   ├── localRedemptionRepository.js # File-based storage
│   │   └── dynamoRedemptionRepository.js # DynamoDB storage
│   ├── middleware/
│   │   ├── errorHandler.js            # Global error handling
│   │   ├── validation.js               # Request validation
│   │   └── requestId.js                # Request ID tracking
│   └── utils/
│       ├── logger.js                   # Winston logger
│       ├── errors.js                   # Custom error classes
│       └── retry.js                    # Retry with exponential backoff
├── test/
│   └── app.test.js                     # Comprehensive tests
├── data/
│   ├── staff.csv                       # Staff-to-team mapping
│   └── redemptions.json                # Redeemed teams (created at runtime)
├── config.js                           # Configuration management
├── .env.example                        # Environment template
├── package.json
└── README.md                           # This file
```
