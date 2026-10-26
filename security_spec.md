# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Default Deny & Verified Identity**: All Firestore paths are closed by default (`match /{document=**} { allow read, write: if false; }`). Every write requires an authenticated user with `request.auth.token.email_verified == true`.
2. **PII Isolation (`users/{userId}`)**: User profiles contain email and role metadata. `get` is restricted strictly to the document owner (`request.auth.uid == userId`) or a verified administrator (`isAdmin()`). `list` queries are restricted to `resource.data.uid == request.auth.uid` or the verified bootstrapped admin.
3. **Anti-Privilege Escalation**: Users registering their own profile (`create` on `/users/{userId}`) cannot self-assign `Administrador`, `Finanzas`, or `Aprobador` roles unless they are the verified bootstrapped administrator (`wrhg1970@gmail.com`). During `update`, non-admin users can only update `displayName`, `lastActiveAt`, and `updatedAt`.
4. **Dossier Ownership & Query Enforcement (`travel_requests/{requestId}`)**: Every travel request requires `ownerUid == request.auth.uid` on creation, a valid ID matching `^[a-zA-Z0-9_\-]+$`, bounded `authorizedUids` (`size() <= 50`), and server timestamps (`createdAt == request.time`, `updatedAt == request.time`). Terminal states (`Cancelada`) lock non-admin updates.
5. **Financial Configuration Protection (`system_configs/{configId}`)**: Only verified administrators (`isAdmin()`) can create or update global financial formulas, exchange rates, approval thresholds, or integration configurations.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Write**: `auth = null` attempting to create `/travel_requests/req_01` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'wrhg1970@gmail.com', email_verified: false } }` attempting admin write -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on User Profile**: Adding `isSuperAdmin: true` to `/users/u1` -> `PERMISSION_DENIED` via `hasOnly()`.
4. **Self-Assigned Admin Escalation**: Regular user creating `/users/u2` with `role: 'Administrador'` -> `PERMISSION_DENIED`.
5. **Role Mutation on Update**: Regular user updating `/users/u2` with changed `role: 'Finanzas'` -> `PERMISSION_DENIED` via `affectedKeys().hasOnly()`.
6. **PII Blanket Read Attempt**: Authenticated user `u2` attempting `get` on `/users/u1` -> `PERMISSION_DENIED`.
7. **Identity Spoofing on Travel Request Create**: User `u1` creating `/travel_requests/req_01` with `ownerUid: 'u2'` -> `PERMISSION_DENIED`.
8. **ID Poisoning Attack**: Creating document with malformed or 500-char ID -> `PERMISSION_DENIED` via `isValidId()`.
9. **Timestamp Forgery**: Client passing forged past timestamp (`createdAt != request.time`) -> `PERMISSION_DENIED`.
10. **Terminal State Bypass**: Non-admin attempting to update a travel request whose existing `status == 'Cancelada'` -> `PERMISSION_DENIED`.
11. **Unbounded Array Exhaustion**: Passing `authorizedUids` with 100 elements (`size() > 50`) -> `PERMISSION_DENIED`.
12. **Unauthorized Financial Rule Modification**: Non-admin user attempting to update `/system_configs/main` -> `PERMISSION_DENIED`.
