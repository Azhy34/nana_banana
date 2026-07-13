/**
 * Generates a random hex string of a given length.
 */
function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generates a 32-character hex traceId.
 */
export function generateTraceId(): string {
  return randomHex(32);
}

/**
 * Generates an 8-byte (16-character) hex spanId.
 */
export function generateSpanId(): string {
  return randomHex(16);
}

/**
 * Formats a traceId and spanId into a W3C traceparent header.
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function formatTraceParent(traceId: string, spanId = generateSpanId()): string {
  return `00-${traceId}-${spanId}-01`;
}
