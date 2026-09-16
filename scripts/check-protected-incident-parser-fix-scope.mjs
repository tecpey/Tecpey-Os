import fs from "node:fs";
const marker = fs.readFileSync(".github/.protected-incident-parser-fix-scope", "utf8");
if (!marker.includes("No deploy") || !marker.includes("production change")) throw new Error("protected incident parser scope marker invalid");
console.log("protected incident parser fix scope: bounded");
