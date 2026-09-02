# Foundation Architecture

```text
React web app
    |
    | JSON/HTTPS
    v
Django REST API ---- PostgreSQL
    |
    +---- private file storage adapter
    |
    +---- blockchain provider boundary ---- EVM JSON-RPC
```

## Boundaries

- Django is the authoritative system of record for users, workflows, permissions, audit metadata, and blockchain transaction state.
- File bytes are handled through a private storage adapter. A later object-storage change must not alter domain models.
- EVM communication is isolated behind a provider boundary. The application remains operable while blockchain support is disabled or unavailable.
- The frontend uses the versioned `/api/v1` boundary and does not access databases, files, or wallets directly.
- On-chain payloads must contain opaque identifiers and cryptographic hashes, never personal data.
