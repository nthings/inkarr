// Download Client Queue API - Get active downloads from all enabled clients

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

interface QueueItem {
  id: string;
  name: string;
  size: number;
  downloaded: number;
  progress: number;
  status: string;
  downloadClient: string;
  eta?: number; // seconds
  downloadSpeed?: number; // bytes/sec
}

/**
 * @swagger
 * /api/v1/downloadclient/queue:
 *   get:
 *     summary: Get download queue from all enabled clients
 *     tags: [Download Clients]
 *     responses:
 *       200:
 *         description: Combined download queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queue:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       size: { type: integer }
 *                       downloaded: { type: integer }
 *                       progress: { type: number }
 *                       status: { type: string }
 *                       downloadClient: { type: string }
 *                       eta: { type: integer }
 *                       downloadSpeed: { type: integer }
 *                 totalDownloading: { type: integer }
 *                 totalItems: { type: integer }
 */
export async function GET() {
  try {
    // Get all enabled download clients
    const clients = await prisma.downloadClient.findMany({
      where: { enable: true },
    });

    if (clients.length === 0) {
      return NextResponse.json({ queue: [], totalDownloading: 0 });
    }

    const allItems: QueueItem[] = [];

    for (const client of clients) {
      const settings = JSON.parse(client.settings);
      
      try {
        const items = await fetchQueue(client.implementation, settings, client.name);
        allItems.push(...items);
      } catch (error) {
        console.error(`Error fetching queue from ${client.name}:`, error);
      }
    }

    return NextResponse.json({
      queue: allItems,
      totalDownloading: allItems.filter(i => i.status === 'downloading').length,
      totalItems: allItems.length,
    });
  } catch (error) {
    console.error('Error fetching download queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch download queue' },
      { status: 500 }
    );
  }
}

async function fetchQueue(
  implementation: string,
  settings: Record<string, any>,
  clientName: string
): Promise<QueueItem[]> {
  const { host, port, useSsl, username, password, urlBase } = settings;
  const protocol = useSsl ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}${urlBase || ''}`;

  switch (implementation) {
    case 'qBittorrent':
      return fetchQBittorrentQueue(baseUrl, username, password, clientName);
    case 'Transmission':
      return fetchTransmissionQueue(baseUrl, username, password, clientName);
    default:
      return [];
  }
}

async function fetchQBittorrentQueue(
  baseUrl: string,
  username?: string,
  password?: string,
  clientName?: string
): Promise<QueueItem[]> {
  // First authenticate if needed
  let cookie = '';
  if (username && password) {
    const loginRes = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });
    cookie = loginRes.headers.get('set-cookie') || '';
  }

  // Fetch torrents - filter by inkarr tag to only show downloads from this app
  const response = await fetch(`${baseUrl}/api/v2/torrents/info?tag=inkarr`, {
    headers: cookie ? { Cookie: cookie } : {},
  });

  if (!response.ok) {
    throw new Error(`qBittorrent API error: ${response.status}`);
  }

  const torrents = await response.json();

  return torrents.map((t: any) => ({
    id: t.hash,
    name: t.name,
    size: t.size,
    downloaded: t.downloaded,
    progress: Math.round(t.progress * 100),
    status: mapQBittorrentState(t.state),
    downloadClient: clientName || 'qBittorrent',
    eta: t.eta > 0 && t.eta < 8640000 ? t.eta : undefined,
    downloadSpeed: t.dlspeed,
  }));
}

function mapQBittorrentState(state: string): string {
  const stateMap: Record<string, string> = {
    'downloading': 'downloading',
    'stalledDL': 'stalled',
    'pausedDL': 'paused',
    'queuedDL': 'queued',
    'checkingDL': 'checking',
    'metaDL': 'downloading',
    'forcedDL': 'downloading',
    'uploading': 'seeding',
    'stalledUP': 'seeding',
    'pausedUP': 'completed',
    'queuedUP': 'seeding',
    'checkingUP': 'checking',
    'forcedUP': 'seeding',
    'allocating': 'checking',
    'moving': 'moving',
    'error': 'error',
    'missingFiles': 'error',
  };
  return stateMap[state] || state;
}

async function fetchTransmissionQueue(
  baseUrl: string,
  username?: string,
  password?: string,
  clientName?: string
): Promise<QueueItem[]> {
  // First request to get session ID
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  let sessionId = '';
  
  // Transmission requires session ID from first request
  const firstRes = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method: 'torrent-get', arguments: { fields: ['id'] } }),
  });

  if (firstRes.status === 409) {
    sessionId = firstRes.headers.get('x-transmission-session-id') || '';
  }

  if (sessionId) {
    headers['X-Transmission-Session-Id'] = sessionId;
  }

  const response = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      method: 'torrent-get',
      arguments: {
        fields: ['id', 'name', 'totalSize', 'percentDone', 'status', 'eta', 'rateDownload', 'downloadedEver', 'labels'],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Transmission API error: ${response.status}`);
  }

  const data = await response.json();
  const torrents = data.arguments?.torrents || [];

  // Filter by inkarr label (Transmission 3.0+)
  const inkarrTorrents = torrents.filter((t: any) => 
    t.labels && Array.isArray(t.labels) && t.labels.includes('inkarr')
  );

  return inkarrTorrents.map((t: any) => ({
    id: t.id.toString(),
    name: t.name,
    size: t.totalSize,
    downloaded: t.downloadedEver,
    progress: Math.round(t.percentDone * 100),
    status: mapTransmissionStatus(t.status),
    downloadClient: clientName || 'Transmission',
    eta: t.eta > 0 ? t.eta : undefined,
    downloadSpeed: t.rateDownload,
  }));
}

function mapTransmissionStatus(status: number): string {
  const statusMap: Record<number, string> = {
    0: 'paused',
    1: 'queued',
    2: 'checking',
    3: 'queued',
    4: 'downloading',
    5: 'queued',
    6: 'seeding',
  };
  return statusMap[status] || 'unknown';
}
