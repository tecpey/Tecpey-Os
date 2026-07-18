# TecPey Server-Side Source of Truth

Status: **Authoritative architecture invariant**

## Rule

All durable user and platform state is owned by TecPey backend services and persisted in the platform database. Browser storage is never authoritative.

The browser may hold short-lived in-memory projections for rendering and optimistic interaction, but those projections:

- must be reconstructible from authenticated backend APIs;
- must not survive as the only copy of user state;
- must reconcile with the server response after every mutation;
- must surface synchronization failures instead of silently claiming success.

## Covered domains

- Identity, account and device-independent preferences
- Academy progress, lessons, quizzes, XP, streaks, badges, certificates and flashcards
- Mentor conversations, memories, behavioral profiles and authorized event history
- Trading Arena subscriptions, attempts, balances, positions, orders, trades, journal and performance
- Exchange balances, orders, trades, ledger, compliance, wallet and withdrawal state

## Prohibited authoritative storage

- `localStorage`
- `sessionStorage`
- IndexedDB
- service-worker caches
- browser-only React stores

Security session cookies remain permitted when they are `HttpOnly`, `Secure` and backed by server-verifiable session state. They are transport credentials, not product data storage.

## Migration sequence

1. Academy progress state
2. Flashcard and reflection state
3. Trading Arena state and event history
4. Remaining preferences and offline-sync paths
5. Repository guard preventing new authoritative browser persistence

Each migration requires database schema, authenticated API, client hydration, mutation reconciliation, tests and CI evidence before merge.
