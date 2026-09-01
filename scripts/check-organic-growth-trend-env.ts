function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.includes("CHANGE_ME")) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function optionalSecret(name: string): boolean {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return false;
  if (value.includes("CHANGE_ME") || value.length < 8) throw new Error(`${name.toLowerCase()}_invalid`);
  return true;
}

function optionalModel(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!/^[A-Za-z0-9._:/-]{2,120}$/.test(value)) throw new Error(`${name.toLowerCase()}_invalid`);
  return value;
}

try {
  required("DATABASE_URL");
  const xaiEnabled = optionalSecret("XAI_API_KEY");
  const perplexityEnabled = optionalSecret("PERPLEXITY_API_KEY");
  if (!xaiEnabled && !perplexityEnabled) throw new Error("growth_trend_provider_required");
  const xaiModel = optionalModel("GROWTH_XAI_MODEL", "grok-4");
  const perplexityModel = optionalModel("GROWTH_PERPLEXITY_MODEL", "sonar-pro");
  console.log(JSON.stringify({
    ok: true,
    scheduler: "organic-growth-trend",
    providers: { xai: xaiEnabled, perplexity: perplexityEnabled },
    models: { xai: xaiModel, perplexity: perplexityModel },
  }));
} catch (error) {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
    ? error.message
    : "growth_trend_environment_invalid";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
}
