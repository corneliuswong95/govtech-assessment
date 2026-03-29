
# 🎁 Gift Redemption System – Architecture & Design (Node.js)

## 1. Overview

This system allows staff representatives to redeem a gift on behalf of their team. Each team is only allowed **one successful redemption**.

The system performs three core operations:

1. Look up staff pass ID → team name  
2. Check if the team has already redeemed  
3. Record redemption if eligible  

---

## 2. Design Goals

- **Correctness**: Ensure each team can only redeem once
- **Scalability**: Handle concurrent redemption requests safely
- **Performance**: Fast lookup for staff → team mapping
- **Testability**: Business logic should be easily unit testable
- **Simplicity**: Keep implementation clean and readable

---

## 3. High-Level Architecture

### Local / Take-home Implementation

```

Client / CLI / API
|
v
Redemption Service (Node.js)
|
+------> Staff Mapping (In-Memory Map from CSV)
|
+------> Redemption Repository (Local File / DB)

```

### AWS Scalable Architecture

```

Client
|
v
API Gateway
|
v
AWS Lambda (Node.js)
|
+------> DynamoDB (staff_mappings)
|
+------> DynamoDB (redemptions)
|
+------> CloudWatch Logs

````

---

## 4. Core Components

### 4.1 Redemption Service (Business Logic Layer)

Main entry point for redemption logic.

```js
redeem(staffPassId)
````

Flow:

1. Retrieve team from staff mapping
2. If staff not found → reject
3. Attempt to insert redemption record
4. If already redeemed → reject
5. Otherwise → success

---

### 4.2 Staff Mapping Repository

#### Implementation

* Load CSV into memory at startup
* Store in a Map

```js
Map<staff_pass_id, team_name>
```

#### Why?

* O(1) lookup
* Very fast
* Simple for assignment

#### Production Option

* Store in DynamoDB or Redis cache

---

### 4.3 Redemption Repository

Handles persistence and uniqueness enforcement.

#### Data Model

```json
{
  "team_name": "string",
  "redeemed_at": 1234567890,
  "redeemed_by": "string"
}
```

---

## 5. Critical Design Decision: Prevent Duplicate Redemption

### Problem

Two concurrent requests:

```
Request A → check → not redeemed
Request B → check → not redeemed
Both write → ❌ duplicate redemption
```

### Solution: Atomic Write

Use conditional write in DynamoDB:

```js
ConditionExpression: 'attribute_not_exists(team_name)'
```

### Result

* First request succeeds
* Second request fails automatically
* No race condition

---

## 6. Data Storage Strategy

### Staff Mapping

| Option    | Decision | Reason                  |
| --------- | -------- | ----------------------- |
| In-memory | ✅ Used   | Fast, simple            |
| File      | ❌        | Not scalable            |
| Database  | ⚙️       | Optional for production |

---

### Redemption Data

| Option    | Decision | Reason                   |
| --------- | -------- | ------------------------ |
| In-memory | ❌        | Not persistent           |
| File      | ⚙️       | Used for local testing   |
| Database  | ✅        | Required for scalability |

---

## 7. Code Structure

```
src/
  services/
    redemptionService.js

  repositories/
    staffMappingRepository.js
    localRedemptionRepository.js
    dynamoRedemptionRepository.js

  utils/
    logger.js

  middleware/
    errorHandler.js

  app.js

data/
  staff.csv
  redemptions.json

test/
  *.test.js
```

---

## 8. API Design

### POST /redeem

#### Request

```json
{
  "staff_pass_id": "STAFF_1"
}
```

#### Success Response

```json
{
  "status": "SUCCESS",
  "team": "TEAM_A"
}
```

#### Failure Response

```json
{
  "status": "FAILED",
  "reason": "ALREADY_REDEEMED"
}
```

---

## 9. Unit Testing Strategy

### Tools

* Jest

### Coverage

#### Redemption Service

* Valid staff → success
* Invalid staff → reject
* Duplicate redemption → reject

#### Repository

* Simulate successful insert
* Simulate duplicate condition

#### CSV Loader

* Valid parsing
* Invalid rows

---

## 10. Assumptions

* Each staff belongs to exactly one team
* Each team can redeem only once
* Staff mapping CSV is valid and consistent
* `created_at` is not required for logic
* System is stateless

---

## 11. Scalability Considerations

* Stateless API → horizontal scaling
* DynamoDB → auto scaling
* Atomic writes → safe concurrency
* Optional caching layer (Redis)

---

## 12. Logging & Error Handling

### Logging

* Use Winston for structured logs
* Include timestamps and error stacks

### Error Handling

* Central middleware
* Standard error response format

```json
{
  "status": "ERROR",
  "message": "Internal Server Error"
}
```

---

## 13. Future Improvements

* Add authentication
* Add rate limiting
* Add audit logs
* Add Redis caching
* Add monitoring (CloudWatch / Prometheus)

---

## 14. Summary

This design ensures:

* ✅ One redemption per team (strictly enforced)
* ✅ Safe concurrency handling
* ✅ Fast lookup via in-memory mapping
* ✅ Scalable backend with DynamoDB
* ✅ Clean and testable Node.js architecture


