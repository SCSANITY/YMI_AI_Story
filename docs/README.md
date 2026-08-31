# YMI Story Next.js Application Documentation

This directory documents only the Next.js application in this repository. It
does not own platform status, cross-component decisions, issue ledgers, or the
platform backlog.

## Platform Authority

When this repository is opened inside the YMI Story workspace, start with
`../../docs/README.md`. Remote-only readers can use the private governance
repository:

`https://github.com/SCSANITY/YMI_Story_Workspace_Governance/tree/main/docs`

## Application References

- `../AGENTS.md`: component-specific agent instructions.
- `../README.md`: application setup and local development entry point.
- `../package.json`: authoritative development, test, and build commands.
- `../tests/`: runtime and source-contract coverage.
- `../tests/fixtures/external-contracts/`: versioned SQL and Worker contract
  snapshots required for isolated CI.

The application repository may add focused documentation for its architecture,
API routes, Admin UI, testing, Vercel deployment, or local development. Any
cross-platform state or deferred work belongs in the root governance repository.
