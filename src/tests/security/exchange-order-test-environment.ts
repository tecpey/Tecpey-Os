export function isolateExchangeOrderTestCache(): () => void {
  const previousRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  return () => {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
    globalThis.tecpeyEngineBooks?.clear();
    globalThis.tecpeyEngineBooks = undefined;
    globalThis.tecpeyOrderBookStore = undefined;
    globalThis.tecpeyMatchingEngine = undefined;
  };
}
