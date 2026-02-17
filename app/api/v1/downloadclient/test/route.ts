// Download Client Test API - Test connection to download client

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

/**
 * @swagger
 * /api/v1/downloadclient/test:
 *   post:
 *     summary: Test download client connection
 *     tags: [Download Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   id: { type: integer, description: Existing client ID }
 *               - type: object
 *                 required:
 *                   - implementation
 *                   - host
 *                 properties:
 *                   implementation: { type: string, enum: [qBittorrent, Transmission, SABnzbd, NZBGet] }
 *                   host: { type: string }
 *                   port: { type: integer }
 *                   useSsl: { type: boolean }
 *                   username: { type: string }
 *                   password: { type: string }
 *     responses:
 *       200:
 *         description: Connection test result
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    let implementation: string;
    let settings: Record<string, any>;
    
    // Support two modes:
    // 1. Test by ID (existing client): { id: 123 }
    // 2. Test by settings (new client): { implementation, host, port, ... }
    if (body.id) {
      // Fetch existing client from database
      const client = await prisma.downloadClient.findUnique({
        where: { id: body.id },
      });
      
      if (!client) {
        return NextResponse.json(
          { success: false, message: 'Download client not found' },
          { status: 404 }
        );
      }
      
      implementation = client.implementation;
      // Settings are stored as JSON string
      const parsedSettings = JSON.parse(client.settings);
      settings = {
        host: parsedSettings.host,
        port: parsedSettings.port,
        useSsl: parsedSettings.useSsl,
        username: parsedSettings.username || undefined,
        password: parsedSettings.password || undefined,
        apiKey: parsedSettings.apiKey || undefined,
        urlBase: parsedSettings.urlBase || undefined,
      };
    } else {
      // Test with provided settings (for new client before saving)
      implementation = body.implementation;
      settings = {
        host: body.host,
        port: body.port,
        useSsl: body.useSsl || false,
        username: body.username || undefined,
        password: body.password || undefined,
        apiKey: body.apiKey || undefined,
        urlBase: body.urlBase || undefined,
      };
    }

    if (!implementation || !settings.host || !settings.port) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: implementation, host, port' },
        { status: 400 }
      );
    }

    // Test connection based on implementation
    const testResult = await testConnection(implementation, settings);

    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Successfully connected to download client',
        version: testResult.version,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: testResult.error,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error testing download client:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to test download client connection' },
      { status: 500 }
    );
  }
}

async function testConnection(
  implementation: string, 
  settings: Record<string, any>
): Promise<{ success: boolean; version?: string; error?: string }> {
  const { host, port, useSsl, username, password, apiKey, urlBase } = settings;
  const protocol = useSsl ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}${urlBase || ''}`;

  try {
    switch (implementation) {
      case 'qBittorrent': {
        // Try to get API version
        const response = await fetch(`${baseUrl}/api/v2/app/version`, {
          method: 'GET',
        });
        if (response.ok) {
          const version = await response.text();
          return { success: true, version };
        }
        // May need to authenticate first
        if (username && password) {
          const loginResponse = await fetch(`${baseUrl}/api/v2/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
          });
          if (loginResponse.ok) {
            return { success: true, version: 'Authenticated' };
          }
        }
        return { success: false, error: 'Failed to connect to qBittorrent' };
      }

      case 'Transmission': {
        const response = await fetch(`${baseUrl}/transmission/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(username && password && {
              'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
            }),
          },
          body: JSON.stringify({ method: 'session-get' }),
        });
        // Transmission returns 409 with session ID header on first request
        if (response.ok || response.status === 409) {
          return { success: true, version: 'Connected' };
        }
        return { success: false, error: 'Failed to connect to Transmission' };
      }

      case 'SABnzbd': {
        const url = new URL(`${baseUrl}/api`);
        url.searchParams.set('apikey', apiKey);
        url.searchParams.set('mode', 'version');
        url.searchParams.set('output', 'json');
        
        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          return { success: true, version: data.version };
        }
        return { success: false, error: 'Failed to connect to SABnzbd' };
      }

      case 'NZBGet': {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const response = await fetch(`${baseUrl}/jsonrpc`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ method: 'version', params: [] }),
        });
        if (response.ok) {
          const data = await response.json();
          return { success: true, version: data.result };
        }
        return { success: false, error: 'Failed to connect to NZBGet' };
      }

      default:
        return { success: false, error: `Unknown implementation: ${implementation}` };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
