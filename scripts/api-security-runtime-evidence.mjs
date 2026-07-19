const PRINCIPAL_CALL_PATTERNS = [
  /\b(getCanonicalSession)\s*\(/,
  /\b(requireCanonicalSession)\s*\(/,
  /\b(getAcademyAuthFromRequest)\s*\(/,
  /\b(getStudentSessionFromRequest)\s*\(/,
  /\b(getUnifiedSessionFromRequest)\s*\(/,
  /\b(getNotificationIdentityFromRequest)\s*\(/,
  /\b(verifyUnifiedSession)\s*\(/,
  /\b(verifyAccessToken)\s*\(/,
  /\b(setCurrentPublicVisibility)\s*\(/,
  /\b(authorizeAdminRequest)\s*\(/,
  /\b(loadAdminPrincipal)\s*\(/,
  /\b(requireAdmin[A-Za-z0-9_]*)\s*\(/,
  /\b(requireAuth[A-Za-z0-9_]*)\s*\(/,
  /\b(requireUser[A-Za-z0-9_]*)\s*\(/,
  /\b(requireStudent[A-Za-z0-9_]*)\s*\(/,
  /\b(getAcademy[A-Za-z0-9_]*Session)\s*\(/,
  /\b(verifyInternal[A-Za-z0-9_]*)\s*\(/,
  /\b(serviceIdentity[A-Za-z0-9_]*)\s*\(/,
  /\b(authenticate[A-Za-z0-9_]*)\s*\(/,
  /\b((?:get|require|verify|resolve|load|authorize)[A-Za-z0-9_]*(?:Session|Identity|Principal|Auth|User|Account)[A-Za-z0-9_]*)\s*\(/,
];

function stripComments(source) {
  const text = String(source ?? "");
  let output = "";
  let index = 0;
  let quote = null;
  let escaped = false;

  while (index < text.length) {
    const current = text[index];
    const next = text[index + 1];

    if (quote !== null) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      output += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      output += "  ";
      index += 2;
      while (index < text.length && text[index] !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      output += "  ";
      index += 2;
      while (index < text.length) {
        if (text[index] === "*" && text[index + 1] === "/") {
          output += "  ";
          index += 2;
          break;
        }
        output += text[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

export function runtimeEvidenceSource(handler) {
  return stripComments(handler);
}

export function detectPrincipalCall(handler) {
  const source = runtimeEvidenceSource(handler);
  for (const pattern of PRINCIPAL_CALL_PATTERNS) {
    const match = source.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

export function detectAdminAuthorityCall(handler) {
  const source = runtimeEvidenceSource(handler);
  return /\b(?:authorizeAdminRequest|loadAdminPrincipal|requireAdmin[A-Za-z0-9_]*|verifyAdmin[A-Za-z0-9_]*|assertAdmin[A-Za-z0-9_]*)\s*\(/.test(source);
}

export function detectCsrfCall(handler) {
  const source = runtimeEvidenceSource(handler);
  return /\b(?:verifyCsrfOrigin|verifyCsrfToken|assertSameOrigin|requireCsrf|csrfProtection)\s*\(/.test(source);
}

export function detectAuditCall(handler) {
  const source = runtimeEvidenceSource(handler);
  return /\b(?:writeAudit|writeAdminAuditEvent|recordAudit[A-Za-z0-9_]*|emitSecurityEvent|securityEvent|trackAuthEvent|withObservability)\s*\(/.test(source)
    || /\blogger\.(?:info|warn|error)\s*\(/.test(source)
    || /\b(?:student_events|admin_events)\b/.test(source);
}

export function detectRedactionCall(handler) {
  const source = runtimeEvidenceSource(handler);
  return /\b(?:redact[A-Za-z0-9_]*|sanitize[A-Za-z0-9_]*|safeError[A-Za-z0-9_]*|apiError|notificationApiError|withObservability)\s*\(/.test(source);
}

export function detectServiceIdentityEvidence(handler) {
  const source = runtimeEvidenceSource(handler);
  const governedVerifier = /\b(?:verifyInternal[A-Za-z0-9_]*|verifyService[A-Za-z0-9_]*|authenticateService[A-Za-z0-9_]*|serviceIdentity[A-Za-z0-9_]*)\s*\(/.test(source);
  if (governedVerifier) return true;

  const authorizationRead = /\b(?:req|request)\.headers\.get\s*\(\s*["']authorization["']\s*\)/i.test(source);
  const cryptographicCheck = /\b(?:timingSafeEqual|jwtVerify|createHmac|verifySignature|verifyToken)\s*\(/.test(source);
  return authorizationRead && cryptographicCheck;
}

export function detectDirectNoStoreEvidence(handler) {
  const source = runtimeEvidenceSource(handler);
  return /["']Cache-Control["']\s*:\s*["'][^"']*(?:no-store|private)/i.test(source)
    || /\bnoStore\s*\(/.test(source)
    || /\bnotificationApi(?:Ok|Error)\s*\(/.test(source);
}

export function detectSessionCookieWrite(handler) {
  const source = runtimeEvidenceSource(handler);
  return /\b(?:response|res)\.cookies\.set\s*\(/.test(source)
    || /\bcookies\s*\(\s*\)\.set\s*\(/.test(source)
    || /["']Set-Cookie["']\s*:/.test(source);
}
