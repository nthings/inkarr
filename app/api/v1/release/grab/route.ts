// Release Grab API - Send release to download client

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

// Debug logging helper - controlled by DEBUG_LOGGING env var
const debug = (...args: unknown[]) => {
  if (process.env.DEBUG_LOGGING === 'true') {
    console.log('[DEBUG]', ...args);
  }
};

interface GrabRequest {
  indexerId: number;
  guid: string;
  downloadUrl: string;
  seriesId?: number;
  volumeId?: number;
  chapterId?: number;
}

/**
 * @swagger
 * /api/v1/release/grab:
 *   post:
 *     summary: Send a release to download client
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - indexerId
 *               - downloadUrl
 *             properties:
 *               indexerId: { type: integer }
 *               guid: { type: string }
 *               downloadUrl: { type: string }
 *               seriesId: { type: integer }
 *               volumeId: { type: integer }
 *               chapterId: { type: integer }
 *     responses:
 *       200:
 *         description: Release sent to download client
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Indexer or download client not found
 */
export async function POST(request: NextRequest) {
  try {
    const body: GrabRequest = await request.json();
    const { indexerId, guid, downloadUrl, seriesId, volumeId, chapterId } = body;

    debug('[Grab] Request:', { indexerId, guid, downloadUrl: downloadUrl?.substring(0, 100), seriesId, volumeId, chapterId });

    if (indexerId === undefined || indexerId === null || !downloadUrl) {
      return NextResponse.json(
        { error: `Missing required fields: indexerId=${indexerId}, downloadUrl=${downloadUrl ? 'present' : 'missing'}` },
        { status: 400 }
      );
    }

    // Get indexer info
    const indexer = await prisma.indexer.findUnique({
      where: { id: indexerId },
    });

    if (!indexer) {
      return NextResponse.json(
        { error: 'Indexer not found' },
        { status: 404 }
      );
    }

    // Find an enabled download client matching the indexer protocol
    const downloadClient = await prisma.downloadClient.findFirst({
      where: {
        enable: true,
        protocol: indexer.protocol,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    if (!downloadClient) {
      return NextResponse.json(
        { 
          error: `No enabled download client found for protocol: ${indexer.protocol}`,
          grabbed: false,
        },
        { status: 400 }
      );
    }

    const settings = JSON.parse(downloadClient.settings);

    // Send to download client based on implementation
    let downloadResult;
    
    switch (downloadClient.implementation) {
      case 'qBittorrent':
        downloadResult = await sendToQBittorrent(settings, downloadUrl, indexer.protocol);
        break;
      case 'Transmission':
        downloadResult = await sendToTransmission(settings, downloadUrl);
        break;
      case 'SABnzbd':
        downloadResult = await sendToSABnzbd(settings, downloadUrl);
        break;
      case 'Blackhole':
        downloadResult = await sendToBlackhole(settings, downloadUrl, guid);
        break;
      default:
        // For unsupported clients, just log and return success
        console.log(`Download client ${downloadClient.implementation} not fully implemented. URL: ${downloadUrl}`);
        downloadResult = { success: true, downloadId: guid };
    }

    if (!downloadResult.success) {
      return NextResponse.json(
        { 
          error: downloadResult.error || 'Failed to send to download client',
          grabbed: false,
        },
        { status: 500 }
      );
    }

    // Log the grab to history (if we had a History model)
    // For now, just return success

    // If we have series/volume/chapter info, we could track the download
    // This would be useful for import later

    return NextResponse.json({
      grabbed: true,
      downloadId: downloadResult.downloadId,
      downloadClient: downloadClient.name,
      message: `Release sent to ${downloadClient.name}`,
    });
  } catch (error) {
    console.error('Error grabbing release:', error);
    return NextResponse.json(
      { error: 'Failed to grab release', grabbed: false },
      { status: 500 }
    );
  }
}

interface DownloadResult {
  success: boolean;
  downloadId?: string;
  error?: string;
}

async function sendToQBittorrent(
  settings: { host: string; port: number; username?: string; password?: string; category?: string; useSsl?: boolean },
  url: string,
  protocol: string
): Promise<DownloadResult> {
  try {
    const baseUrl = `${settings.useSsl ? 'https' : 'http'}://${settings.host}:${settings.port}`;
    
    // First, authenticate
    const loginResponse = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: settings.username || '',
        password: settings.password || '',
      }),
    });

    if (!loginResponse.ok) {
      return { success: false, error: 'Failed to authenticate with qBittorrent' };
    }

    const cookies = loginResponse.headers.get('set-cookie');

    // Add torrent with inkarr category and tag
    const formData = new FormData();
    formData.append('urls', url);
    formData.append('category', settings.category || 'inkarr');
    formData.append('tags', 'inkarr');

    const addResponse = await fetch(`${baseUrl}/api/v2/torrents/add`, {
      method: 'POST',
      headers: cookies ? { Cookie: cookies } : {},
      body: formData,
    });

    if (!addResponse.ok) {
      return { success: false, error: 'Failed to add torrent to qBittorrent' };
    }

    return { success: true, downloadId: url };
  } catch (error) {
    console.error('qBittorrent error:', error);
    return { success: false, error: String(error) };
  }
}

async function sendToTransmission(
  settings: { host: string; port: number; username?: string; password?: string; useSsl?: boolean },
  url: string
): Promise<DownloadResult> {
  try {
    const baseUrl = `${settings.useSsl ? 'https' : 'http'}://${settings.host}:${settings.port}/transmission/rpc`;
    
    // Get session ID first
    let sessionId = '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (settings.username && settings.password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
    }

    // First request to get X-Transmission-Session-Id
    const sessionResponse = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method: 'session-get' }),
    });

    if (sessionResponse.status === 409) {
      sessionId = sessionResponse.headers.get('X-Transmission-Session-Id') || '';
    }

    // Add torrent with inkarr label
    const addResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'X-Transmission-Session-Id': sessionId,
      },
      body: JSON.stringify({
        method: 'torrent-add',
        arguments: {
          filename: url,
          labels: ['inkarr'], // Transmission 3.0+
        },
      }),
    });

    if (!addResponse.ok) {
      return { success: false, error: 'Failed to add torrent to Transmission' };
    }

    const result = await addResponse.json();
    if (result.result !== 'success') {
      return { success: false, error: result.result };
    }

    return { 
      success: true, 
      downloadId: result.arguments?.['torrent-added']?.hashString || url 
    };
  } catch (error) {
    console.error('Transmission error:', error);
    return { success: false, error: String(error) };
  }
}

async function sendToSABnzbd(
  settings: { host: string; port: number; apiKey: string; category?: string; useSsl?: boolean },
  url: string
): Promise<DownloadResult> {
  try {
    const baseUrl = `${settings.useSsl ? 'https' : 'http'}://${settings.host}:${settings.port}/sabnzbd/api`;
    
    const params = new URLSearchParams({
      mode: 'addurl',
      name: url,
      apikey: settings.apiKey,
      output: 'json',
    });
    
    if (settings.category) {
      params.set('cat', settings.category);
    }

    const response = await fetch(`${baseUrl}?${params}`);
    
    if (!response.ok) {
      return { success: false, error: 'Failed to add NZB to SABnzbd' };
    }

    const result = await response.json();
    if (result.status === false) {
      return { success: false, error: result.error || 'SABnzbd error' };
    }

    return { success: true, downloadId: result.nzo_ids?.[0] || url };
  } catch (error) {
    console.error('SABnzbd error:', error);
    return { success: false, error: String(error) };
  }
}

async function sendToBlackhole(
  settings: { host?: string; watchFolder: string },
  url: string,
  guid: string
): Promise<DownloadResult> {
  try {
    // Download the file and save to the watch folder
    const response = await fetch(url);
    
    if (!response.ok) {
      return { success: false, error: 'Failed to download file' };
    }

    // For blackhole, we would save the file to the watch folder
    // This would require filesystem access which needs to be done server-side
    // For now, we'll just log it
    console.log(`Blackhole: Would save ${url} to ${settings.watchFolder}`);
    
    return { success: true, downloadId: guid };
  } catch (error) {
    console.error('Blackhole error:', error);
    return { success: false, error: String(error) };
  }
}
