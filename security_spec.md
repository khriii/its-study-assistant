# Security Specification & Payload-First TDD (`ITS Universal Study Assistant`)

## 1. Data Invariants
1. **Strict Owner Isolation**: Every document under `/users/{userId}` and its subcollections (`preferences`, `subjects`, `folders`, `notes`, `flashcards`, `quizzes`) MUST be readable, listable, creatable, updatable, and deletable exclusively by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. **PII Isolation**: User email and profile fields live strictly inside `/users/{userId}` with zero blanket `isSignedIn()` reads or list access across users.
3. **Immutable Ownership & Timestamps**: `userId`, `id`, and `createdAt` cannot be modified after creation; `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. **Relational Parent Existence**: Creating a `Folder` requires the referenced `subjectId` to exist under the owner; creating a `Note` requires `subjectId` (and `folderId` if non-null) to exist; creating a `Flashcard` or `Quiz` requires both `subjectId` and `noteId` to exist.
5. **Terminal State Locking (`Quiz`)**: Once a `Quiz` transitions to `status == 'completed'`, no subsequent updates are permitted (history entries are immutable; only deletion is allowed).
6. **Bounded Payloads & IDs**: All document IDs match `^[a-zA-Z0-9_-]{1,128}$`; all strings and arrays enforce explicit `.size()` bounds (`questions.size() <= 20`, `openTabs.size() <= 40`, `panelOrder.size() == 6`).

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Cross-User Profile Read**: User B attempts `get(/users/userA)`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Write**: User A with `email_verified: false` attempts `create(/users/userA/notes/note_1)`. Expected: `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User A attempts `create(/users/userA/notes/note_1)` with `userId: "userB"`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection**: User A attempts `create(/users/userA/subjects/sub_1)` with extra field `isAdmin: true`. Expected: `PERMISSION_DENIED`.
5. **Path ID Poisoning**: User A attempts `create(/users/userA/notes/bad..id$1)` with invalid characters in `{noteId}`. Expected: `PERMISSION_DENIED`.
6. **Orphaned Note Creation**: User A attempts `create(/users/userA/notes/note_1)` referencing non-existent `subjectId: "missing_sub"`. Expected: `PERMISSION_DENIED`.
7. **Timestamp Forgery**: User A attempts `create(/users/userA/notes/note_1)` with backdated `createdAt` != `request.time`. Expected: `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: User A attempts `update(/users/userA/notes/note_1)` changing `userId` or `createdAt`. Expected: `PERMISSION_DENIED`.
9. **Terminal Quiz Tampering**: User A attempts `update(/users/userA/quizzes/quiz_1)` when `existing().status == 'completed'` to alter `score`. Expected: `PERMISSION_DENIED`.
10. **Denial-of-Wallet Oversized Array**: User A attempts `create(/users/userA/quizzes/quiz_1)` with 25 questions (`> 20` limit). Expected: `PERMISSION_DENIED`.
11. **Invalid Hex Color Value Poisoning**: User A attempts `update(/users/userA/subjects/sub_1)` with `color: "not-a-hex"`. Expected: `PERMISSION_DENIED`.
12. **Cross-User Collection List**: User B attempts `list(/users/userA/notes)` or queries without matching `userId`. Expected: `PERMISSION_DENIED`.
