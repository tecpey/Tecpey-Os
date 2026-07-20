from pathlib import Path
import json
import re

IMPORT_LINE = 'import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";'

CONFIGS = {
    "src/app/api/academy/auth/login/route.ts": ("req", 8_192, True, "apiError"),
    "src/app/api/academy/auth/register/route.ts": ("req", 8_192, True, "apiError"),
    "src/app/api/academy-auth/route.ts": ("req", 8_192, False, "apiError"),
    "src/app/api/academy-certificates/route.ts": ("req", 2_048, True, "apiError"),
    "src/app/api/academy-flashcards/route.ts": ("req", 512_000, False, "apiError"),
    "src/app/api/academy-lead/route.ts": ("request", 3_000, True, "apiError"),
    "src/app/api/academy-lesson-assessment/route.ts": ("req", 64_000, False, "apiError"),
    "src/app/api/academy-reflections/route.ts": ("req", 16_384, False, "apiError"),
    "src/app/api/academy-simulator-decision/route.ts": ("req", 20_000, True, "apiError"),
    "src/app/api/academy-specialized-lead/route.ts": ("req", 5_000, True, "apiError"),
    "src/app/api/academy-student-profile/route.ts": ("req", 80_000, False, "apiError"),
    "src/app/api/academy-term-progress/route.ts": ("req", 80_000, True, "apiError"),
    "src/app/api/admin/withdrawals/[id]/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/ai-mentor/route.ts": ("request", 24_000, False, "apiError"),
    "src/app/api/api-keys/[id]/route.ts": ("req", 4_096, False, "apiError"),
    "src/app/api/api-keys/route.ts": ("req", 8_192, False, "apiError"),
    "src/app/api/auth/2fa/backup/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/auth/2fa/disable/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/auth/2fa/enroll/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/auth/2fa/verify/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/auth/devices/[id]/route.ts": ("req", 2_048, True, "apiError"),
    "src/app/api/auth/password/change/route.ts": ("req", 8_192, False, "apiError"),
    "src/app/api/auth/webauthn/auth/challenge/route.ts": ("req", 8_192, True, "apiError"),
    "src/app/api/auth/webauthn/auth/verify/route.ts": ("req", 131_072, False, "apiError"),
    "src/app/api/auth/webauthn/credentials/[id]/route.ts": ("req", 2_048, True, "apiError"),
    "src/app/api/auth/webauthn/register/verify/route.ts": ("req", 131_072, False, "apiError"),
    "src/app/api/auth/withdraw/authorize/route.ts": ("req", 16_384, True, "apiError"),
    "src/app/api/auth/withdraw/route.ts": ("req", 16_384, True, "apiError"),
    "src/app/api/command-center/auth/bootstrap/challenge/route.ts": ("req", 8_192, True, "apiError"),
    "src/app/api/command-center/auth/bootstrap/verify/route.ts": ("req", 131_072, False, "apiError"),
    "src/app/api/command-center/auth/passkey/verify/route.ts": ("req", 131_072, False, "apiError"),
    "src/app/api/command-center/campaign/route.ts": ("req", 32_768, True, "apiError"),
    "src/app/api/community/profile/route.ts": ("req", 2_048, True, "apiError"),
    "src/app/api/device-token/route.ts": ("req", 4_096, True, "apiError"),
    "src/app/api/learning-events/route.ts": ("req", 48_000, True, "apiError"),
    "src/app/api/mentor-challenge/route.ts": ("req", 40_000, True, "apiError"),
    "src/app/api/mentor-conversations/migrate/route.ts": ("req", 262_144, False, "apiError"),
    "src/app/api/mentor-memory/route.ts": ("req", 16_000, True, "apiError"),
    "src/app/api/notifications/[id]/route.ts": ("req", 4_096, False, "notificationApiError"),
    "src/app/api/notifications/consent/route.ts": ("req", 2_048, False, "notificationApiError"),
    "src/app/api/notifications/preferences/route.ts": ("req", 8_192, False, "notificationApiError"),
    "src/app/api/notifications/read/route.ts": ("req", 2_048, True, "apiError"),
    "src/app/api/offline-sync/route.ts": ("req", 320_000, True, "apiError"),
    "src/app/api/orders/route.ts": ("req", 4_000, True, "apiError"),
    "src/app/api/trading-arena/execution/route.ts": ("request", 12_000, False, "apiError"),
    "src/app/api/trading-arena/reflections/route.ts": ("request", 20_000, False, "fail"),
    "src/app/api/trading-arena/route.ts": ("request", 8_000, False, "apiError"),
}


def insert_import(source: str, path: str) -> str:
    if IMPORT_LINE in source:
        return source
    lines = source.splitlines()
    last_import_end = None
    in_import = False
    for index, line in enumerate(lines):
        if not in_import and line.startswith("import "):
            in_import = True
        if in_import and ";" in line:
            last_import_end = index
            in_import = False
    if last_import_end is None:
        raise SystemExit(f"no import block found: {path}")
    lines.insert(last_import_end + 1, IMPORT_LINE)
    return "\n".join(lines) + ("\n" if source.endswith("\n") else "")


def migrate_route(path: str, config: tuple[str, int, bool, str]) -> None:
    file = Path(path)
    source = file.read_text()
    if "readBoundedJsonRequest(" in source:
        raise SystemExit(f"route already migrated unexpectedly: {path}")

    request_variable, max_bytes, allow_empty, error_builder = config
    source = insert_import(source, path)
    parser_pattern = re.compile(rf"\b{re.escape(request_variable)}\.(?:json|text)\s*\(")
    parser = parser_pattern.search(source)
    if not parser:
        raise SystemExit(f"request body parser not found: {path}")

    line_start = source.rfind("\n", 0, parser.start()) + 1
    indent = re.match(r"[ \t]*", source[line_start:]).group(0)
    limit = f"{max_bytes:_}"
    guard = [
        f"{indent}const boundedBodyRequest = await readBoundedJsonRequest({request_variable}, {{",
        f"{indent}  maxBytes: {limit},",
    ]
    if allow_empty:
        guard.append(f"{indent}  allowEmptyObject: true,")
    guard.extend(
        [
            f"{indent}}});",
            f"{indent}if (!boundedBodyRequest.ok) {{",
            f"{indent}  return {error_builder}(boundedBodyRequest.error, boundedBodyRequest.status);",
            f"{indent}}}",
            f"{indent}{request_variable} = boundedBodyRequest.request;",
        ]
    )
    source = source[:line_start] + "\n".join(guard) + "\n" + source[line_start:]
    file.write_text(source)


def update_package() -> None:
    path = Path("package.json")
    package = json.loads(path.read_text())
    scripts = package["scripts"]
    scripts["bounded-body:check"] = "node scripts/check-bounded-request-body-authority.mjs"
    scripts["test:bounded-body"] = (
        "NODE_ENV=test node --import tsx --test --test-force-exit "
        "src/tests/security/bounded-request-body.test.ts"
    )
    release = scripts["release:check"]
    needle = "npm run api:security:check && npm run test:api-security-manifest"
    replacement = (
        "npm run bounded-body:check && npm run test:bounded-body && "
        "npm run api:security:check && npm run test:api-security-manifest"
    )
    if replacement not in release:
        if needle not in release:
            raise SystemExit("release:check insertion point missing")
        scripts["release:check"] = release.replace(needle, replacement, 1)
    path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n")


if len(CONFIGS) != 47:
    raise SystemExit(f"expected 47 direct route migrations, found {len(CONFIGS)}")

for route_path, route_config in CONFIGS.items():
    migrate_route(route_path, route_config)

update_package()
print("Migrated 47 direct handlers to the streaming bounded body authority.")
