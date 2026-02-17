// Calibre Test API - Test connection to Calibre Content Server

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { testConnection } from '@/app/lib/calibre';
import type { CalibreSettings } from '@/app/lib/types/calibre';

/**
 * @swagger
 * /api/v1/calibre/test:
 *   post:
 *     summary: Test connection to Calibre Content Server
 *     tags: [Calibre]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   id: { type: integer, description: Existing calibre settings ID }
 *               - type: object
 *                 required:
 *                   - host
 *                 properties:
 *                   host: { type: string }
 *                   port: { type: integer, default: 8080 }
 *                   useSsl: { type: boolean }
 *                   username: { type: string }
 *                   password: { type: string }
 *     responses:
 *       200:
 *         description: Connection test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 libraries: { type: array, items: { type: string } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[API] POST /api/v1/calibre/test - Request body:', JSON.stringify(body));

    let settings: CalibreSettings;

    // Support two modes:
    // 1. Test by ID (existing settings): { id: 123 }
    // 2. Test by settings (new settings): { host, port, ... }
    if (body.id) {
      // Fetch existing settings from database
      const existing = await prisma.calibreSettings.findUnique({
        where: { id: body.id },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, message: 'Calibre settings not found' },
          { status: 404 }
        );
      }

      settings = {
        host: existing.host,
        port: existing.port,
        urlBase: existing.urlBase ?? undefined,
        username: existing.username ?? undefined,
        password: existing.password ?? undefined,
        library: existing.library ?? undefined,
        outputFormat: existing.outputFormat ?? undefined,
        outputProfile: existing.outputProfile.toLowerCase() as CalibreSettings['outputProfile'],
        useSsl: existing.useSsl,
      };
    } else {
      // Test with provided settings (for new settings before saving)
      if (!body.host) {
        return NextResponse.json(
          { success: false, message: 'Host is required' },
          { status: 400 }
        );
      }

      settings = {
        host: body.host,
        port: body.port ?? 8080,
        urlBase: body.urlBase,
        username: body.username,
        password: body.password,
        library: body.library,
        outputFormat: body.outputFormat,
        outputProfile: body.outputProfile ?? 'default',
        useSsl: body.useSsl ?? false,
      };
    }

    // Test the connection
    console.log('[API] Testing Calibre connection with settings:', JSON.stringify({
      host: settings.host,
      port: settings.port,
      urlBase: settings.urlBase,
      useSsl: settings.useSsl,
      // Don't log credentials
    }));
    
    const result = await testConnection(settings);
    console.log('[API] Test connection result:', JSON.stringify(result));

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        libraries: result.libraries,
        defaultLibrary: result.defaultLibrary,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.message,
        libraries: result.libraries,
        defaultLibrary: result.defaultLibrary,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error testing Calibre connection:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to test Calibre connection' 
      },
      { status: 500 }
    );
  }
}
