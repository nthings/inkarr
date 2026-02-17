// Download Clients API - GET all, POST new

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import type { IDownloadClient, DownloadClientType, DownloadProtocol } from '@/app/lib/types';

/**
 * @swagger
 * /api/v1/downloadclient:
 *   get:
 *     summary: Get all download clients
 *     tags: [Download Clients]
 *     responses:
 *       200:
 *         description: List of configured download clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   implementation: { type: string, enum: [qBittorrent, Transmission, SABnzbd, NZBGet] }
 *                   protocol: { type: string, enum: [usenet, torrent] }
 *                   host: { type: string }
 *                   port: { type: integer }
 *                   enabled: { type: boolean }
 *                   priority: { type: integer }
 */
export async function GET() {
  try {
    const clients = await prisma.downloadClient.findMany({
      include: {
        status: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    // Parse settings JSON for each client and flatten for UI consumption
    const parsed = clients.map(client => {
      const settings = JSON.parse(client.settings);
      return {
        ...client,
        // Flatten settings for UI
        host: settings.host,
        port: settings.port,
        useSsl: settings.useSsl,
        username: settings.username,
        password: settings.password,
        apiKey: settings.apiKey,
        urlBase: settings.urlBase,
        // Keep original settings object too
        settings,
        tags: client.tags ? JSON.parse(client.tags) : [],
        enabled: client.enable, // UI uses 'enabled', DB uses 'enable'
      };
    });

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching download clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch download clients' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Support both flat format (from UI) and nested settings format
    let settings: Record<string, any>;
    let name: string;
    let implementation: DownloadClientType;
    let protocol: DownloadProtocol;
    let enable: boolean;
    let priority: number;
    let removeCompletedDownloads: boolean;
    let removeFailedDownloads: boolean;
    let tags: number[] | undefined;
    
    if (body.settings) {
      // Nested format: { name, implementation, protocol, settings: { host, port, ... } }
      settings = body.settings;
      name = body.name;
      implementation = body.implementation;
      protocol = body.protocol;
      enable = body.enable ?? true;
      priority = body.priority ?? 1;
      removeCompletedDownloads = body.removeCompletedDownloads ?? true;
      removeFailedDownloads = body.removeFailedDownloads ?? true;
      tags = body.tags;
    } else {
      // Flat format from UI: { name, implementation, protocol, host, port, username, password, apiKey }
      name = body.name;
      implementation = body.implementation;
      protocol = body.protocol;
      enable = body.enabled ?? true;
      priority = body.priority ?? 1;
      removeCompletedDownloads = body.removeCompletedDownloads ?? true;
      removeFailedDownloads = body.removeFailedDownloads ?? true;
      tags = body.tags;
      
      settings = {
        host: body.host,
        port: body.port,
        useSsl: body.useSsl ?? false,
        urlBase: body.urlBase || '',
        username: body.username || undefined,
        password: body.password || undefined,
        apiKey: body.apiKey || undefined,
      };
    }

    if (!name || !implementation || !protocol || !settings) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate settings based on implementation
    const validationError = validateSettings(implementation, settings);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const client = await prisma.downloadClient.create({
      data: {
        name,
        implementation,
        protocol,
        settings: JSON.stringify(settings),
        enable,
        priority,
        removeCompletedDownloads,
        removeFailedDownloads,
        tags: tags ? JSON.stringify(tags) : null,
      },
    });

    return NextResponse.json({
      ...client,
      settings,
      tags: tags || [],
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating download client:', error);
    return NextResponse.json(
      { error: 'Failed to create download client' },
      { status: 500 }
    );
  }
}

function validateSettings(implementation: string, settings: Record<string, any>): string | null {
  // Basic validation
  if (!settings.host || !settings.port) {
    return 'Host and port are required';
  }

  switch (implementation) {
    case 'SABnzbd':
      if (!settings.apiKey) {
        return 'API key is required for SABnzbd';
      }
      break;
    case 'NZBGet':
      if (!settings.username || !settings.password) {
        return 'Username and password are required for NZBGet';
      }
      break;
    case 'QBittorrent':
    case 'Transmission':
    case 'Deluge':
      // These may or may not require authentication
      break;
  }

  return null;
}
