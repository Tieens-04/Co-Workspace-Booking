export function validateTestDatabase(testUrl: string | undefined, developmentUrl?: string): string {
  const error = new Error(
    'TEST_DATABASE_URL must point to a separate MySQL database ending in _test.',
  );
  if (!testUrl) throw error;
  let target: URL;
  try {
    target = new URL(testUrl);
  } catch {
    throw error;
  }
  const name = decodeURIComponent(target.pathname.slice(1));
  if (target.protocol !== 'mysql:' || !/^[a-zA-Z0-9_]+_test$/.test(name)) throw error;
  if (developmentUrl) {
    let development: URL;
    try {
      development = new URL(developmentUrl);
    } catch {
      throw error;
    }
    // Conservatively reject the same schema name even via a different host alias/user.
    if (decodeURIComponent(development.pathname.slice(1)).toLowerCase() === name.toLowerCase()) {
      throw error;
    }
  }
  return testUrl;
}
