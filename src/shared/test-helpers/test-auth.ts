/**
 * Returns HTTP headers that the test-mode auth middleware accepts as a valid
 * synthetic identity. Use with supertest to authenticate requests in API tests.
 *
 * Only works when NODE_ENV=test. Never use in production code.
 */
export function testAuthHeaders(userId: string, displayName: string): Record<string, string> {
  return {
    'X-Test-User-Id': userId,
    'X-Test-Display-Name': displayName,
  };
}
