// JSON serialization utilities for handling BigInt and other special types

/**
 * Convert BigInt values to numbers or strings for JSON serialization
 */
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === 'bigint' ? Number(value) : value
    )
  );
}

/**
 * JSON replacer function for BigInt
 */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}
