// Download Client Queue API - Get active downloads from all enabled clients

import { NextRequest, NextResponse } from 'next/server';
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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
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
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *                 totalPages: { type: integer }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10')));

    // Get all enabled download clients
    const clients = await prisma.downloadClient.findMany({
      where: { enable: true },
    });

    if (clients.length === 0) {
      return NextResponse.json({ 
        queue: [], 
        totalDownloading: 0, 
        totalItems: 0,
        page: 1,
        pageSize,
        totalPages: 0,
      });
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

    // Sort: downloading first, then by name
    allItems.sort((a, b) => {
      if (a.status === 'downloading' && b.status !== 'downloading') return -1;
      if (a.status !== 'downloading' && b.status === 'downloading') return 1;
      return a.name.localeCompare(b.name);
    });

    // Paginate
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = allItems.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      queue: paginatedItems,
      totalDownloading: allItems.filter(i => i.status === 'downloading').length,
      totalItems,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching download queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch download queue' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/downloadclient/queue:
 *   delete:
 *     summary: Remove item from download client queue
 *     tags: [Download Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - downloadClient
 *             properties:
 *               id: { type: string, description: Download ID }
 *               downloadClient: { type: string, description: Download client name }
 *               deleteFiles: { type: boolean, default: false, description: Also delete downloaded files }
 *     responses:
 *       200:
 *         description: Item removed from queue
 *       404:
 *         description: Download client not found
 *       500:
 *         description: Failed to remove item
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, downloadClient, deleteFiles = false } = body;

    if (!id || !downloadClient) {
      return NextResponse.json(
        { error: 'Missing required fields: id and downloadClient' },
        { status: 400 }
      );
    }

    // Find the download client by name
    const client = await prisma.downloadClient.findFirst({
      where: { name: downloadClient, enable: true },
    });

    if (!client) {
      return NextResponse.json(
        { error: `Download client not found: ${downloadClient}` },
        { status: 404 }
      );
    }

    const settings = JSON.parse(client.settings);
    const result = await removeFromQueue(client.implementation, settings, id, deleteFiles);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to remove item' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Item removed from queue' });
  } catch (error) {
    console.error('Error removing from queue:', error);
    return NextResponse.json(
      { error: 'Failed to remove item from queue' },
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
    case 'SABnzbd':
      return fetchSABnzbdQueue(baseUrl, settings.apiKey, clientName);
    case 'NZBGet':
      return fetchNZBGetQueue(baseUrl, username, password, clientName);
    default:
      return [];
  }
}

interface RemoveResult {
  success: boolean;
  error?: string;
}

async function removeFromQueue(
  implementation: string,
  settings: Record<string, any>,
  id: string,
  deleteFiles: boolean
): Promise<RemoveResult> {
  const { host, port, useSsl, username, password, urlBase } = settings;
  const protocol = useSsl ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}${urlBase || ''}`;

  switch (implementation) {
    case 'qBittorrent':
      return removeFromQBittorrent(baseUrl, username, password, id, deleteFiles);
    case 'Transmission':
      return removeFromTransmission(baseUrl, username, password, id, deleteFiles);
    case 'SABnzbd':
      return removeFromSABnzbd(baseUrl, settings.apiKey, id, deleteFiles);
    case 'NZBGet':
      return removeFromNZBGet(baseUrl, username, password, id, deleteFiles);
    default:
      return { success: false, error: `Unsupported download client: ${implementation}` };
  }
}

async function removeFromQBittorrent(
  baseUrl: string,
  username: string | undefined,
  password: string | undefined,
  hash: string,
  deleteFiles: boolean
): Promise<RemoveResult> {
  try {
    let cookie = '';
    if (username && password) {
      const loginRes = await fetch(`${baseUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      });
      cookie = loginRes.headers.get('set-cookie') || '';
    }

    const response = await fetch(`${baseUrl}/api/v2/torrents/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: `hashes=${hash}&deleteFiles=${deleteFiles}`,
    });

    return { success: response.ok };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function removeFromTransmission(
  baseUrl: string,
  username: string | undefined,
  password: string | undefined,
  id: string,
  deleteFiles: boolean
): Promise<RemoveResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (username && password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    // Get session ID
    const firstRes = await fetch(`${baseUrl}/transmission/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method: 'session-get' }),
    });

    if (firstRes.status === 409) {
      headers['X-Transmission-Session-Id'] = firstRes.headers.get('x-transmission-session-id') || '';
    }

    const response = await fetch(`${baseUrl}/transmission/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        method: 'torrent-remove',
        arguments: {
          ids: [parseInt(id)],
          'delete-local-data': deleteFiles,
        },
      }),
    });

    const data = await response.json();
    return { success: data.result === 'success' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function removeFromSABnzbd(
  baseUrl: string,
  apiKey: string,
  id: string,
  deleteFiles: boolean
): Promise<RemoveResult> {
  try {
    // Try to delete from queue first
    const queueRes = await fetch(
      `${baseUrl}/api?mode=queue&name=delete&value=${id}&del_files=${deleteFiles ? 1 : 0}&apikey=${apiKey}&output=json`
    );
    
    if (queueRes.ok) {
      const queueData = await queueRes.json();
      if (queueData.status) {
        return { success: true };
      }
    }

    // If not in queue, try history
    const historyRes = await fetch(
      `${baseUrl}/api?mode=history&name=delete&value=${id}&del_files=${deleteFiles ? 1 : 0}&apikey=${apiKey}&output=json`
    );

    if (historyRes.ok) {
      const historyData = await historyRes.json();
      return { success: historyData.status === true };
    }

    return { success: false, error: 'Item not found in queue or history' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function removeFromNZBGet(
  baseUrl: string,
  username: string | undefined,
  password: string | undefined,
  id: string,
  deleteFiles: boolean
): Promise<RemoveResult> {
  try {
    const auth = username && password 
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';
    
    const urlWithAuth = baseUrl.replace('://', `://${auth}`);

    // Try to delete from queue
    const queueRes = await fetch(`${urlWithAuth}/jsonrpc/editqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'editqueue',
        params: ['GroupDelete', '', [parseInt(id)]],
      }),
    });

    if (queueRes.ok) {
      const queueData = await queueRes.json();
      if (queueData.result) {
        return { success: true };
      }
    }

    // Try to delete from history
    const historyRes = await fetch(`${urlWithAuth}/jsonrpc/editqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'editqueue',
        params: ['HistoryDelete', '', [parseInt(id)]],
      }),
    });

    const historyData = await historyRes.json();
    return { success: historyData.result === true };
  } catch (error) {
    return { success: false, error: String(error) };
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

async function fetchSABnzbdQueue(
  baseUrl: string,
  apiKey: string,
  clientName?: string
): Promise<QueueItem[]> {
  // Fetch active queue
  const queueRes = await fetch(`${baseUrl}/api?mode=queue&apikey=${apiKey}&output=json`);
  
  if (!queueRes.ok) {
    throw new Error(`SABnzbd API error: ${queueRes.status}`);
  }

  const queueData = await queueRes.json();
  const slots = queueData.queue?.slots || [];

  // Fetch history for recently completed items
  const historyRes = await fetch(`${baseUrl}/api?mode=history&apikey=${apiKey}&output=json&limit=20`);
  const historyData = historyRes.ok ? await historyRes.json() : { history: { slots: [] } };
  const historySlots = historyData.history?.slots || [];

  const items: QueueItem[] = [];

  // Active downloads
  for (const slot of slots) {
    items.push({
      id: slot.nzo_id,
      name: slot.filename,
      size: parseSize(slot.size),
      downloaded: parseSize(slot.size) * (parseInt(slot.percentage) / 100),
      progress: parseInt(slot.percentage) || 0,
      status: mapSABnzbdStatus(slot.status),
      downloadClient: clientName || 'SABnzbd',
      eta: parseEta(slot.timeleft),
      downloadSpeed: parseSpeed(queueData.queue?.speed),
    });
  }

  // Recently completed from history (last 20)
  for (const slot of historySlots) {
    // Only show items completed in the last 24 hours
    const completedTime = slot.completed * 1000;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    if (completedTime > dayAgo) {
      items.push({
        id: slot.nzo_id,
        name: slot.name,
        size: slot.bytes,
        downloaded: slot.bytes,
        progress: 100,
        status: slot.status === 'Completed' ? 'completed' : mapSABnzbdStatus(slot.status),
        downloadClient: clientName || 'SABnzbd',
      });
    }
  }

  return items;
}

function mapSABnzbdStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'Downloading': 'downloading',
    'Paused': 'paused',
    'Queued': 'queued',
    'Grabbing': 'downloading',
    'Fetching': 'downloading',
    'QuickCheck': 'checking',
    'Verifying': 'checking',
    'Repairing': 'checking',
    'Extracting': 'extracting',
    'Moving': 'moving',
    'Running': 'postprocessing',
    'Completed': 'completed',
    'Failed': 'error',
  };
  return statusMap[status] || status.toLowerCase();
}

function parseSize(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB|TB|B)/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
  };
  
  return Math.round(value * (multipliers[unit] || 1));
}

function parseEta(timeStr: string): number | undefined {
  if (!timeStr || timeStr === '0:00:00') return undefined;
  
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return undefined;
}

function parseSpeed(speedStr: string): number | undefined {
  if (!speedStr) return undefined;
  const match = speedStr.match(/([\d.]+)\s*(K|M|G|B)/i);
  if (!match) return undefined;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers: Record<string, number> = {
    'B': 1,
    'K': 1024,
    'M': 1024 * 1024,
    'G': 1024 * 1024 * 1024,
  };
  
  return Math.round(value * (multipliers[unit] || 1));
}

async function fetchNZBGetQueue(
  baseUrl: string,
  username?: string,
  password?: string,
  clientName?: string
): Promise<QueueItem[]> {
  const auth = username && password 
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : '';
  
  const urlWithAuth = baseUrl.replace('://', `://${auth}`);

  // Fetch active queue
  const queueRes = await fetch(`${urlWithAuth}/jsonrpc/listgroups`);
  
  if (!queueRes.ok) {
    throw new Error(`NZBGet API error: ${queueRes.status}`);
  }

  const queueData = await queueRes.json();
  const groups = queueData.result || [];

  // Fetch history
  const historyRes = await fetch(`${urlWithAuth}/jsonrpc/history`);
  const historyData = historyRes.ok ? await historyRes.json() : { result: [] };
  const history = (historyData.result || []).slice(0, 20);

  const items: QueueItem[] = [];

  // Active downloads
  for (const group of groups) {
    const downloaded = group.DownloadedSizeMB * 1024 * 1024;
    const total = group.FileSizeMB * 1024 * 1024;
    
    items.push({
      id: group.NZBID.toString(),
      name: group.NZBName,
      size: total,
      downloaded: downloaded,
      progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
      status: mapNZBGetStatus(group.Status),
      downloadClient: clientName || 'NZBGet',
      eta: group.RemainingSizeMB > 0 && group.DownloadRate > 0 
        ? Math.round((group.RemainingSizeMB * 1024 * 1024) / group.DownloadRate)
        : undefined,
      downloadSpeed: group.DownloadRate,
    });
  }

  // Recent history
  for (const item of history) {
    // Only show items completed in the last 24 hours
    const completedTime = item.HistoryTime * 1000;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    if (completedTime > dayAgo) {
      items.push({
        id: item.NZBID.toString(),
        name: item.Name,
        size: item.FileSizeMB * 1024 * 1024,
        downloaded: item.FileSizeMB * 1024 * 1024,
        progress: 100,
        status: item.Status === 'SUCCESS' ? 'completed' : 'error',
        downloadClient: clientName || 'NZBGet',
      });
    }
  }

  return items;
}

function mapNZBGetStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'DOWNLOADING': 'downloading',
    'PAUSED': 'paused',
    'QUEUED': 'queued',
    'FETCHING': 'downloading',
    'PP_QUEUED': 'queued',
    'LOADING_PARS': 'checking',
    'VERIFYING_SOURCES': 'checking',
    'REPAIRING': 'checking',
    'VERIFYING_REPAIRED': 'checking',
    'RENAMING': 'postprocessing',
    'UNPACKING': 'extracting',
    'MOVING': 'moving',
    'EXECUTING_SCRIPT': 'postprocessing',
    'PP_FINISHED': 'completed',
  };
  return statusMap[status] || status.toLowerCase();
}

