export const GOVERNED_BODY_READERS = Object.freeze([
  "readJsonBody",
  "readBoundedJson",
  "readBoundedBody",
  "readBodyWithLimit",
  "parseBoundedJsonBody",
]);

export function detectBodyLimitEvidence(source) {
  const text = String(source ?? "");
  const headerHint = /\bcheckBodySize\s*\(|content-length/i.test(text);
  const governedReader = text.match(
    new RegExp(`\\b(${GOVERNED_BODY_READERS.join("|")})\\s*\\(`),
  )?.[1] ?? null;
  const streamingReader = /\.body\?*\.getReader\s*\(|\.body\.getReader\s*\(/.test(text)
    && /(?:bytesRead|totalBytes|receivedBytes|size)\s*>\s*[A-Z0-9_]+/.test(text)
    && /(?:cancel|releaseLock|throw|return)\b/.test(text);

  return {
    headerHint,
    authority: governedReader ?? (streamingReader ? "streaming-reader-with-byte-counter" : null),
    enforceable: Boolean(governedReader || streamingReader),
  };
}
