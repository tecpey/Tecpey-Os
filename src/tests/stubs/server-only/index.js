// Test-runtime shim only. Production and Next.js builds keep the real
// `server-only` compile-time boundary; focused Node integration tests resolve
// this no-op module through NODE_PATH so server authorities can execute.
module.exports = {};
