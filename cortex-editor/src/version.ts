// Keep in sync with package.json "version". Enforced by tests/version-sync.test.ts
// so a release bump that updates one but not the other fails CI (the CLI --version,
// MCP server metadata, and telemetry payload all read this constant).
export const version = '0.2.0'
