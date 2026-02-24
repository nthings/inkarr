// API request logging wrapper for production environments
// Provides timing and status code logging similar to Next.js dev server

import { NextRequest, NextResponse } from 'next/server';

type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an API route handler to log request details including:
 * - HTTP method and path
 * - Status code
 * - Request duration
 * 
 * Usage:
 * ```
 * export const GET = withLogging(async (request) => {
 *   // handler code
 *   return NextResponse.json(data);
 * });
 * ```
 */
export function withLogging(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const start = Date.now();
    const method = request.method;
    const pathname = request.nextUrl.pathname;
    const search = request.nextUrl.search;
    const url = `${pathname}${search}`;

    let response: NextResponse;
    let status: number;

    try {
      response = await handler(request, context);
      status = response.status;
    } catch (error) {
      status = 500;
      const duration = Date.now() - start;
      const timestamp = new Date().toISOString();
      console.error(`${timestamp} [HTTP] ${method} ${url} ${status} in ${formatDuration(duration)} - Error:`, error);
      throw error;
    }

    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [HTTP] ${method} ${url} ${status} in ${formatDuration(duration)}`);

    return response;
  };
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export default withLogging;
