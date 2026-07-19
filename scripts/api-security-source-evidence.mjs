const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function methodExportPatterns(method) {
  return [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
    new RegExp(`export\\s+const\\s+${method}\\b`),
  ];
}

export function importPrelude(source) {
  const text = String(source ?? "");
  const firstExport = text.search(/export\s+(?:(?:async\s+)?function|const|\{)/);
  return firstExport > 0 ? text.slice(0, firstExport) : "";
}

export function routeHandlerSource(source, method) {
  const text = String(source ?? "");
  const matches = methodExportPatterns(method)
    .map((pattern) => text.match(pattern))
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
  const match = matches[0];
  if (!match || typeof match.index !== "number") return null;

  const start = match.index;
  const nextExport = new RegExp(
    `export\\s+(?:(?:async\\s+)?function|const)\\s+(?:${ROUTE_METHODS.join("|")})\\b`,
    "g",
  );
  nextExport.lastIndex = start + match[0].length;
  const next = nextExport.exec(text);
  return text.slice(start, next?.index ?? text.length);
}

export function methodEvidenceSource(source, method) {
  const handler = routeHandlerSource(source, method);
  return handler === null ? null : `${importPrelude(source)}\n${handler}`;
}
