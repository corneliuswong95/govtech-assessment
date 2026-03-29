# API Quick Reference

## Architecture

**Three-Table Database Design:**
- **all_staff** - Staff registry with team assignments
- **team_member_count** - Team member counts for fast response
- **redemption_status** - Redeemed teams with atomic writes

See [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) for full schema.

---

## Endpoints

### POST /redeem

Redeem a gift for a staff member. Queries three tables and returns member count.

**Request:**
```json
{
  "staff_pass_id": "string (1-100 chars, required)"
}
```

**Success Response (200):**
```json
{
  "status": "SUCCESS",
  "team": "BASS|RUST",
  "team_member_count": 5,
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Error Responses:**
- **400 VALIDATION_ERROR** - Bad input (missing/invalid staff_pass_id)
- **400 INVALID_STAFF** - Staff not found in all_staff table
- **409 ALREADY_REDEEMED** - Team already redeemed (Retry-After: 5)
- **500 INTERNAL_ERROR** - Server error (auto-retried)

---

### POST /staff

Add a new staff member to the system. Also increments team member count.

**Request:**
```json
{
  "staff_pass_id": "string (1-100 chars, required, alphanumeric+_-)",
  "team_name": "string (1-100 chars, required, alphanumeric+_-)"
}
```

**Success Response (201):**
```json
{
  "status": "SUCCESS",
  "staff_pass_id": "STAFF_001",
  "team_name": "BASS",
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Error Responses:**
- **400 VALIDATION_ERROR** - Missing/invalid fields or team_name format
- **409 STAFF_EXISTS** - Staff ID already registered
- **500 INTERNAL_ERROR** - Database error

---

### GET /staff

Get all staff members.

**Response (200):**
```json
{
  "staff": [
    {
      "staff_pass_id": "STAFF_001",
      "team_name": "BASS",
      "created_at": 1711609800000
    }
  ],
  "total": 4,
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

---

### GET /staff/:id

Get specific staff member details.

**Response (200):**
```json
{
  "staff_pass_id": "STAFF_001",
  "team_name": "BASS",
  "created_at": 1711609800000,
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Error Responses:**
- **400 INVALID_STAFF** - Staff not found

---

### DELETE /staff/:id

Delete a staff member. Returns different status based on redemption state.

**Response (200 - SUCCESS):**
```json
{
  "status": "SUCCESS",
  "message": "Staff deleted successfully",
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Response (206 - HAS REDEMPTION):**
```json
{
  "status": "DELETE_PARTIAL",
  "message": "Staff has redemption record and cannot be fully deleted",
  "redemption": {
    "team_name": "BASS",
    "staff_pass_id": "STAFF_001",
    "redeemed_at": 1711609800000
  },
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Status Codes:**
- **200** - Staff deleted successfully
- **206** - Partial: Staff has redemption, staff not deleted
- **400** - Staff not found

---

### GET /staff/team/:team

Get all staff in a team and team statistics.

**Response (200):**
```json
{
  "team_name": "BASS",
  "staff": [
    {
      "staff_pass_id": "STAFF_001",
      "team_name": "BASS",
      "created_at": 1711609800000
    }
  ],
  "stats": {
    "team_name": "BASS",
    "total_members": 5,
    "staff_count": 2,
    "redeemed": true,
    "redeemed_by": "STAFF_001",
    "redeemed_at": 1711609800000
  },
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

---

### GET /health

Health check with three-table configuration info.

**Response (200):**
```json
{
  "status": "OK",
  "timestamp": "ISO-8601",
  "mode": "local|dynamo",
  "tables": {
    "allStaff": "all_staff | staff.json",
    "teamMemberCount": "team_member_count | team_counts.json",
    "redemptionStatus": "redemption_status | redemptions.json"
  }
}
```

---

## Error Codes

| Code | HTTP | Meaning | Recovery |
|---|---|---|---|
| SUCCESS | 200 | Redemption successful | N/A |
| VALIDATION_ERROR | 400 | Input validation failed | Fix request format |
| INVALID_STAFF | 400 | Staff ID not found | Use valid staff ID |
| STAFF_EXISTS | 409 | Staff already registered | Use different ID |
| ALREADY_REDEEMED | 409 | Team already redeemed | Check Retry-After header |
| INTERNAL_ERROR | 500 | Database/server error | Auto-retry or try later |
| DELETE_PARTIAL | 206 | Staff has redemption | Review redemption record |

---

## HTTP Status Codes

| Status | Meaning | When |
|---|---|---|
| 200 OK | Success | Gift redeemed, staff managed |
| 201 Created | Created | Staff added |
| 206 Partial | Partial | Staff deletion blocked by redemption |
| 400 Bad Request | Client error | Validation or invalid staff |
| 409 Conflict | Duplicate/Blocked | Staff exists orTeam redeemed |
| 500 Internal Server Error | Server error | Database unavailable |

---

## Common Curl Examples

### Successful Redemption
```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}'

# Response:
# {
#   "status": "SUCCESS",
#   "team": "BASS",
#   "team_member_count": 5,
#   "requestId": "...",
#   "timestamp": "2024-03-28T..."
# }
```

### Add New Staff
```bash
curl -X POST http://localhost:3000/staff \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_NEW001", "team_name": "NODEJS"}'

# Response: 201 Created
```

### List All Staff
```bash
curl http://localhost:3000/staff

# Response:
# {
#   "staff": [...],
#   "total": 4,
#   "requestId": "...",
#   "timestamp": "..."
# }
```

### Get Specific Staff
```bash
curl http://localhost:3000/staff/STAFF_H123804820G
```

### Get Team Members & Stats
```bash
curl http://localhost:3000/staff/team/BASS

# Response includes:
# - all staff in BASS team
# - team stats (total_members, redeemed status, etc.)
```

### Delete Staff (No Redemption)
```bash
curl -X DELETE http://localhost:3000/staff/STAFF_NEW001

# Response: 200 SUCCESS
```

### Delete Staff (With Redemption)
```bash  
curl -X DELETE http://localhost:3000/staff/STAFF_H123804820G

# Response: 206 Partial + redemption record
# Staff is NOT deleted to prevent orphaned data
```

### Check Response Status
```bash
curl -i -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}'
# Look for "HTTP/1.1 200 OK"
```

### Pretty Print Response
```bash
curl -s -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "STAFF_H123804820G"}' | jq .
```

### Test Validation Error
```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": ""}'

# Response: 400 VALIDATION_ERROR
```

### Test Invalid Staff
```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -d '{"staff_pass_id": "UNKNOWN"}'

# Response: 400 INVALID_STAFF
```

### Health Check
```bash
curl http://localhost:3000/health
```

---

## Request Headers

| Header | Value | Example |
|---|---|---|
| Content-Type | application/json | application/json |
| X-Request-ID | UUID (optional) | 550e8400-e29b-41d4-a716-446655440000 |

---

## Response Headers

| Header | Meaning | Example |
|---|---|---|
| X-Request-ID | Unique request ID | 550e8400-e29b-41d4-a716-446655440000 |
| Retry-After | Seconds to wait (409 only) | 5 |
| Content-Type | Response format | application/json |

---

## Data Models

### Staff

Location: `all_staff` table or `staff.json`

| Field | Type | Indexed | Example |
|---|---|---|---|
| staff_pass_id | string | PK | STAFF_H123804820G |
| team_name | string | GSI | BASS, RUST |
| created_at | number | - | 1623772799000 |

### Team Member Count

Location: `team_member_count` table or `team_counts.json`

| Field | Type | Indexed | Example |
|---|---|---|---|
| team_name | string | PK | BASS |
| member_count | number | - | 5 |
| updated_at | number | - | 1711609800000 |

### Redemption

Location: `redemption_status` table or `redemptions.json`

| Field | Type | Indexed | Example |
|---|---|---|---|
| team_name | string | PK | BASS |
| staff_pass_id | string | - | STAFF_H123804820G |
| redeemed_at | number | - | 1711609800000 |

---

## Configuration

Key environment variables:

```
STORAGE_MODE=local          # local or dynamo
DYNAMO_ALL_STAFF_TABLE=all_staff
DYNAMO_TEAM_COUNT_TABLE=team_member_count
DYNAMO_REDEMPTION_STATUS_TABLE=redemption_status
PORT=3000
LOG_LEVEL=info
RETRY_MAX_ATTEMPTS=3
```

See `.env.example` for full list.

---

## Rate Limiting

Currently: **None** (add express-rate-limit if needed)

Suggested for production:
- 100 requests/minute per IP
- 1000 requests/minute per staff_pass_id

---

## Timeouts

- API endpoint: 30 seconds (Express default)
- DynamoDB request: 5 seconds (SDK default)
- Retry backoff: 100ms - 5000ms (exponential)
- File I/O: 5 seconds

---

## Monitoring

Key logs to watch:

```json
{"level": "info", "message": "Redemption successful", ...}
{"level": "info", "message": "Duplicate redemption attempt", ...}
{"level": "info", "message": "Staff added successfully", ...}
{"level": "warn", "message": "Staff has existing redemption, returning STAFF_HAS_REDEMPTION", ...}
{"level": "warn", "message": "...failed (attempt 1/3), retrying in ...", ...}
{"level": "error", "message": "Error processing request", ...}
```

---

## Testing Checklist

### Redemption Tests
- [ ] Valid redemption returns 200 with team_member_count
- [ ] Duplicate returns 409
- [ ] Invalid staff returns 400
- [ ] Bad input returns 400
- [ ] Request ID in all responses
- [ ] Retry-After header on 409

### Staff Management Tests
- [ ] POST /staff creates staff and increments count
- [ ] GET /staff returns all staff
- [ ] GET /staff/:id returns specific staff
- [ ] DELETE /staff removes staff and decrements count
- [ ] DELETE /staff with redemption returns 206 PARTIAL
- [ ] GET /staff/team/:team returns team members and stats

### Concurrency Tests
- [ ] Concurrent redemptions handled (only one succeeds)
- [ ] Concurrent staff additions work
- [ ] Race condition prevention verified

### Data Integrity Tests
- [ ] Member count matches staff count (per team)
- [ ] Staff references are valid
- [ ] No orphaned redemptions
- [ ] All three tables stay in sync

---

## Production Checklist

- [ ] STORAGE_MODE=dynamo
- [ ] LOG_LEVEL=warn
- [ ] DynamoDB tables created (3 tables)
- [ ] AWS IAM role configured with DynamoDB permissions
- [ ] CloudWatch monitoring enabled
- [ ] Alerts set up for 5xx errors
- [ ] Rate limiting enabled
- [ ] CORS configured (if needed)
- [ ] HTTPS/TLS enabled
- [ ] Backup strategy for all three tables
- [ ] Monitoring queries for data consistency
- [ ] Deployment tested with 100+ concurrent requests

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| Connection refused | Server not running | `npm start` |
| 400 VALIDATION_ERROR | Bad input format | Check request JSON |
| 400 INVALID_STAFF | Unknown staff | Use staff from all_staff table |
| 409 ALREADY_REDEEMED | Same team twice | Wait or use different staff |
| 206 DELETE_PARTIAL | Staff has redemption | Review redemption record first |
| 500 INTERNAL_ERROR | DB unavailable | Check DynamoDB/file permissions |
| Member count wrong | Tables out of sync | Run consistency check query |

---

## See Also

- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) - Full three-table schema
- [README.md](./README.md) - Getting started
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Phase-by-phase details
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Manual testing steps

