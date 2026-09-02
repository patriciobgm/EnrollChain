# Foundation Acceptance Criteria

The initial foundation is acceptable when:

1. The repository has reproducible backend, frontend, database, and local blockchain environments.
2. The API exposes health, OpenAPI schema, and interactive documentation endpoints.
3. The custom user model supports unique email identities, account status, coarse roles, and Django permissions.
4. JWT access and refresh tokens can be issued without exposing staff-account creation publicly.
5. Audit records are append-oriented and cannot be modified through Django admin.
6. Private uploads do not receive a public media URL by default.
7. Blockchain configuration is disabled by default and represents pending, confirmed, and failed processing states.
8. The frontend has a responsive shell, API client boundary, error boundary, and placeholder role-aware navigation.
9. Automated backend, frontend, and smart-contract checks run in continuous integration.
10. Client-dependent behavior is documented and not presented as final functionality.
