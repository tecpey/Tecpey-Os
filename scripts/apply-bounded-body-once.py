from pathlib import Path
import json
import re

ROOT = Path(".")
LIMITS = {
    "src/app/api/academy-auth/route.ts": "8_192",
    "src/app/api/academy-certificates/route.ts": "16_384",
    "src/app/api/academy-flashcards/route.ts": "512_000",
    "src/app/api/academy-lead/route.ts": "3_000",
    "src/app/api/academy-lesson-assessment/route.ts": "64_000",
    "src/app/api/academy-reflections/route.ts": "16_384",
    "src/app/api/academy-simulator-decision/route.ts": "5_000",
    "src/app/api/academy-specialized-lead/route.ts": "MAX_PAYLOAD_BYTES",
    "src/app/api/academy-student-profile/route.ts": "20_000",
    "src/app/api/academy-term-progress/route.ts": "20_000",
    "src/app/api/academy/auth/login/route.ts": "8_192",
    "src/app/api/academy/auth/register/route.ts": "8_192",
    "src/app/api/admin/withdrawals/[id]/route.ts": "8_192",
    "src/app/api/ai-mentor/route.ts": "6_000",
    "src/app/api/api-keys/route.ts": "8_192",
    "src/app/api/api-keys/[id]/route.ts": "8_192",
    "src/app/api/auth/2fa/backup/route.ts": "8_192",
    "src/app/api/auth/2fa/disable/route.ts": "8_192",
    "src/app/api/auth/2fa/enroll/route.ts": "8_192",
    "src/app/api/auth/2fa/verify/route.ts": "8_192",
    "src/app/api/auth/devices/[id]/route.ts": "4_096",
    "src/app/api/auth/password/change/route.ts": "8_192",
    "src/app/api/auth/webauthn/auth/challenge/route.ts": "8_192",
    "src/app/api/auth/webauthn/auth/verify/route.ts": "64_000",
    "src/app/api/auth/webauthn/credentials/[id]/route.ts": "8_192",
    "src/app/api/auth/webauthn/register/verify/route.ts": "128_000",
    "src/app/api/auth/withdraw/route.ts": "16_384",
    "src/app/api/auth/withdraw/authorize/route.ts": "8_192",
    "src/app/api/command-center/auth/bootstrap/challenge/route.ts": "8_192",
    "src/app/api/command-center/auth/bootstrap/verify/route.ts": "16_384",
    "src/app/api/command-center/auth/passkey/verify/route.ts": "64_000",
    "src/app/api/command-center/campaign/route.ts": "64_000",
    "src/app/api/community/profile/route.ts": "4_096",
    "src/app/api/device-token/route.ts": "8_192",
    "src/app/api/learning-events/route.ts": "12_000",
    "src/app/api/mentor-challenge/route.ts": "8_192",
    "src/app/api/mentor-conversations/migrate/route.ts": "512_000",
    "src/app/api/mentor-memory/route.ts": "4_000",
    "src/app/api/notifications/[id]/route.ts": "4_096",
    "src/app/api/notifications/consent/route.ts": "2_048",
    "src/app/api/notifications/preferences/route.ts": "8_192",
    "src/app/api/notifications/read/route.ts": "8_192",
    "src/app/api/offline-sync/route.ts": "80_000",
    "src/app/api/orders/route.ts": "4_000",
    "src/app/api/trading-arena/route.ts": "8_000",
    "src/app/api/trading-arena/execution/route.ts": "12_000",
    "src/app/api/trading-arena/reflections/route.ts": "20_000",
}


def error_builder(path: str) -> str:
    if path.startswith("src/app/api/notifications/") and path != "src/app/api/notifications/read/route.ts":
        return "notificationApiError"
    if path == "src/app/api/trading-arena/reflections/route.ts":
        return "fail"
    return "apiError"


def body_block(indent: str, request: str, maximum: str, builder: str, variable: str = "body", type_arg: str | None = None) -> str:
    generic = f"<{type_arg}>" if type_arg else ""
    return "\n".join(
        [
            f"{indent}const bodyResult = await readJsonBody{generic}({request}, {{",
            f"{indent}  maxBytes: {maximum},",
            f"{indent}  allowEmptyObject: true,",
            f"{indent}}});",
            f"{indent}if (!bodyResult.ok) return {builder}(bodyResult.error, bodyResult.status);",
            f"{indent}const {variable} = bodyResult.value;",
        ]
    )


def add_import(source: str) -> str:
    if '"@/lib/security/request-body"' in source:
        return source
    return 'import { readJsonBody } from "@/lib/security/request-body";\n' + source


def remove_header_guard_import(source: str) -> str:
    if "checkBodySize(" in source:
        return source
    pattern = re.compile(r'import\s*\{(?P<body>[^}]*)\}\s*from\s*"@/lib/api-validation";')

    def replace(match: re.Match[str]) -> str:
        body = match.group("body")
        if "checkBodySize" not in body:
            return match.group(0)
        names = [
            item.strip()
            for item in body.replace("\n", " ").split(",")
            if item.strip() and item.strip() != "checkBodySize"
        ]
        if not names:
            return ""
        return 'import { ' + ", ".join(names) + ' } from "@/lib/api-validation";'

    return pattern.sub(replace, source)


for relative_path, maximum in LIMITS.items():
    path = ROOT / relative_path
    source = path.read_text()
    original = source
    builder = error_builder(relative_path)

    source = re.sub(
        r'(?m)^[ \t]*if \(!checkBodySize\([^\n]+\)\) return [^\n]+\n',
        "",
        source,
    )
    source = re.sub(
        r'(?ms)^[ \t]*if \(!checkBodySize\([^\n]+\)\) \{\n[ \t]*return [^\n]+\n[ \t]*\}\n',
        "",
        source,
    )

    source = re.sub(
        r'(?m)^(?P<i>[ \t]*)const body = await (?P<r>req|request)\.json\(\)\.catch\(\(\) => \(\{\}\)\)(?: as Record<string, unknown>)?;',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )
    source = re.sub(
        r'(?m)^(?P<i>[ \t]*)let body: unknown;\n(?P=i)try \{ body = await (?P<r>req|request)\.json\(\); \} catch \{ return [^\n]+\}',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )
    source = re.sub(
        r'(?ms)^(?P<i>[ \t]*)let (?P<v>body|raw): unknown;\n(?P=i)try \{\n(?P=i)  (?P=v) = await (?P<r>req|request)\.json\(\);\n(?P=i)\} catch \{\n(?P=i)  return [^\n]+\n(?P=i)\}',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder, match.group("v")),
        source,
    )
    source = re.sub(
        r'(?ms)^(?P<i>[ \t]*)let body: Record<string, unknown>;\n(?P=i)try \{\n(?P=i)  body = await (?P<r>req|request)\.json\(\) as Record<string, unknown>;\n(?P=i)\} catch \{\n(?P=i)  return [^\n]+\n(?P=i)\}',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder, type_arg="Record<string, unknown>"),
        source,
    )
    source = re.sub(
        r'(?m)^(?P<i>[ \t]*)const raw = await (?P<r>req|request)\.text\(\);\n(?P=i)if \(raw\.length > [^\n]+\) return [^\n]+\n(?:\n)?(?P=i)const body = JSON\.parse\(raw(?: \|\| "\{\}")?\)(?: as [^;]+)?;',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )
    source = re.sub(
        r'(?ms)^(?P<i>[ \t]*)const raw = await (?P<r>req|request)\.text\(\);\n(?P=i)if \(Buffer\.byteLength\(raw, "utf8"\) > [^\n]+\) \{\n(?P=i)  return [^\n]+\n(?P=i)\}\n(?P=i)const body = JSON\.parse\(raw(?: \|\| "\{\}")?\)(?: as [^;]+)?;',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )
    source = re.sub(
        r'(?m)^(?P<i>[ \t]*)const raw = await (?P<r>req|request)\.text\(\);\n(?P=i)const body = JSON\.parse\(raw(?: \|\| "\{\}")?\)(?: as [^;]+)?;',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )
    source = re.sub(
        r'(?m)^(?P<i>[ \t]*)const body = await (?P<r>req|request)\.json\(\);',
        lambda match: body_block(match.group("i"), match.group("r"), maximum, builder),
        source,
    )

    if relative_path == "src/app/api/ai-mentor/route.ts":
        source = source.replace(
            '    const raw = await request.text();\n    if (raw.length > 6000) return apiError("payload_too_large", 413);\n\n    const body = JSON.parse(raw) as MentorRequest;',
            body_block("    ", "request", maximum, builder, type_arg="MentorRequest"),
        )
    if relative_path == "src/app/api/mentor-memory/route.ts":
        source = source.replace(
            '    let body: Record<string, unknown>;\n    try {\n      const raw = await req.text();\n      if (raw.length > 4_000) return apiError("payload_too_large", 413);\n      body = JSON.parse(raw || "{}");\n    } catch {\n      return apiError("invalid_json", 400);\n    }',
            body_block("    ", "req", maximum, builder, type_arg="Record<string, unknown>"),
        )
    if relative_path == "src/app/api/orders/route.ts":
        source = source.replace(
            '    let body: Record<string, unknown>;\n    try {\n      const raw = await req.text();\n      if (Buffer.byteLength(raw, "utf8") > 4_000) {\n        return apiError("payload_too_large", 413);\n      }\n      body = JSON.parse(raw || "{}") as Record<string, unknown>;\n    } catch {\n      return apiError("invalid_json", 400);\n    }',
            body_block("    ", "req", maximum, builder, type_arg="Record<string, unknown>"),
        )

    source = add_import(source)
    source = remove_header_guard_import(source)
    if source == original:
        raise SystemExit(f"route migration made no change: {relative_path}")
    if not re.search(r"\breadJsonBody(?:<[^;\n]+>)?\s*\(", source):
        raise SystemExit(f"bounded reader missing after migration: {relative_path}")
    if re.search(r"\b(?:req|request)\.(?:json|text)\s*\(", source):
        raise SystemExit(f"unbounded parser remains after migration: {relative_path}")
    path.write_text(source)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text())
scripts = package["scripts"]
scripts["test:request-body-boundary"] = (
    "NODE_ENV=test node --import tsx --test "
    "src/tests/security/request-body-boundary.test.ts "
    "src/tests/security/request-body-route-boundaries.test.ts"
)
needle = "npm run api:security:check && npm run test:api-security-manifest"
replacement = (
    "npm run test:request-body-boundary && "
    "npm run api:security:check && npm run test:api-security-manifest"
)
if needle not in scripts["release:check"]:
    raise SystemExit("release check insertion point missing")
scripts["release:check"] = scripts["release:check"].replace(needle, replacement, 1)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

print(f"Migrated {len(LIMITS)} direct mutating request-body boundaries.")
