type ConnectionEnvironment = Record<string, string | undefined>;

function required(env: ConnectionEnvironment, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function connectionUrl(
  protocol: "postgresql:" | "redis:",
  hostname: string,
  port: string,
  username: string,
  password: string,
  pathname = "",
): string {
  const url = new URL(`${protocol}//${hostname}:${port}`);
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  url.pathname = pathname;
  return url.toString();
}

export function configureProductionConnectionUrls(
  env: ConnectionEnvironment = process.env,
): void {
  if (!env.DATABASE_URL && env.TECPEY_DATABASE_HOST) {
    env.DATABASE_URL = connectionUrl(
      "postgresql:",
      env.TECPEY_DATABASE_HOST,
      env.TECPEY_DATABASE_PORT || "5432",
      required(env, "TECPEY_DATABASE_USER"),
      required(env, "POSTGRES_PASSWORD"),
      `/${encodeURIComponent(required(env, "TECPEY_DATABASE_NAME"))}`,
    );
  }

  if (!env.REDIS_URL && env.TECPEY_REDIS_HOST) {
    env.REDIS_URL = connectionUrl(
      "redis:",
      env.TECPEY_REDIS_HOST,
      env.TECPEY_REDIS_PORT || "6379",
      "",
      required(env, "REDIS_PASSWORD"),
    );
  }
}
