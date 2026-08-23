"use strict";

// These CLI entrypoints are already confined to the governed Node server
// runtime. Next.js keeps enforcing the real `server-only` marker everywhere
// else; NODE_PATH exposes this no-op only to the explicit package commands.
module.exports = {};
