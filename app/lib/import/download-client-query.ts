// Download Client Query Utility
// Query download clients for completed downloads with "inkarr" category/tag

import prisma from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';

export interface CompletedDownload {
  hash: string;
  name: string;
  savePath: string;  // Directory where files are saved
  contentPath: string;  // Full path to content (file or folder)
  category: string;
  progress: number;
  state: string;
}

/**
 * Get all completed downloads from enabled download clients that have the configured category
 * Returns a list of content paths that should be eligible for import
 */
export async function getInkarrDownloads(): Promise<CompletedDownload[]> {
  const clients = await prisma.downloadClient.findMany({
    where: { enable: true },
  });

  if (clients.length === 0) {
    return [];
  }

  const allDownloads: CompletedDownload[] = [];

  for (const client of clients) {
    const settings = JSON.parse(client.settings);
    // Use the category from download client settings, fall back to 'inkarr'
    const category = settings.category || 'inkarr';
    
    try {
      const downloads = await fetchCompletedDownloads(client.implementation, settings, category);
      allDownloads.push(...downloads);
    } catch (error) {
      console.error(`Error fetching downloads from ${client.name}:`, error);
    }
  }

  return allDownloads;
}

/**
 * Get a Set of content paths from completed downloads with the configured category
 * These paths can be used to filter files during scanning
 * Paths are converted to local filesystem paths using path mapping
 */
export async function getInkarrContentPaths(): Promise<Set<string>> {
  const downloads = await getInkarrDownloads();
  const paths = new Set<string>();
  
  console.log(`[DownloadClientQuery] Found ${downloads.length} completed downloads from client category`);
  
  for (const download of downloads) {
    // Add the content path (this is the actual file/folder location)
    // Apply path mapping to convert Docker paths to local paths
    if (download.contentPath) {
      const localPath = resolveToLocal(download.contentPath);
      paths.add(localPath);
      if (downloads.indexOf(download) < 3) {
        console.log(`[DownloadClientQuery]   ${download.contentPath} -> ${localPath}`);
      }
    }
    // Also add save_path + name as fallback
    if (download.savePath && download.name) {
      const localPath = resolveToLocal(`${download.savePath}/${download.name}`);
      paths.add(localPath);
    }
  }
  
  return paths;
}

/**
 * Check if a file path is part of an "inkarr" download
 */
export async function isInkarrDownload(filePath: string): Promise<boolean> {
  const contentPaths = await getInkarrContentPaths();
  
  // Normalize the file path
  const normalizedPath = filePath.replace(/\/+/g, '/');
  
  for (const contentPath of contentPaths) {
    const normalizedContentPath = contentPath.replace(/\/+/g, '/');
    
    // Check if the file is within the content path (for folder downloads)
    // or matches it exactly (for single file downloads)
    if (normalizedPath.startsWith(normalizedContentPath + '/') || 
        normalizedPath === normalizedContentPath) {
      return true;
    }
  }
  
  return false;
}

async function fetchCompletedDownloads(
  implementation: string,
  settings: Record<string, unknown>,
  category: string
): Promise<CompletedDownload[]> {
  switch (implementation) {
    case 'qBittorrent':
      return fetchQBittorrentCompleted(settings, category);
    case 'SABnzbd':
      return fetchSABnzbdCompleted(settings, category);
    case 'NZBGet':
      return fetchNZBGetCompleted(settings, category);
    default:
      console.warn(`Download client ${implementation} not supported for category filtering`);
      return [];
  }
}

async function fetchQBittorrentCompleted(
  settings: Record<string, unknown>,
  category: string
): Promise<CompletedDownload[]> {
  const { host, port, useSsl, username, password, urlBase } = settings as {
    host: string;
    port: number;
    useSsl?: boolean;
    username?: string;
    password?: string;
    urlBase?: string;
  };
  
  const protocol = useSsl ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}${urlBase || ''}`;

  // Authenticate
  let cookie = '';
  if (username && password) {
    const loginRes = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });
    cookie = loginRes.headers.get('set-cookie') || '';
  }

  // Fetch torrents with the specified category
  // Use category parameter for filtering
  const response = await fetch(
    `${baseUrl}/api/v2/torrents/info?category=${encodeURIComponent(category)}`,
    {
      headers: cookie ? { Cookie: cookie } : {},
    }
  );

  if (!response.ok) {
    throw new Error(`qBittorrent API error: ${response.status}`);
  }

  const torrents = await response.json();

  // Filter to only completed downloads (100% progress)
  return torrents
    .filter((t: { progress: number }) => t.progress >= 1.0)
    .map((t: {
      hash: string;
      name: string;
      save_path: string;
      content_path: string;
      category: string;
      progress: number;
      state: string;
    }) => ({
      hash: t.hash,
      name: t.name,
      savePath: t.save_path,
      contentPath: t.content_path,
      category: t.category,
      progress: t.progress,
      state: t.state,
    }));
}

async function fetchSABnzbdCompleted(
  settings: Record<string, unknown>,
  category: string
): Promise<CompletedDownload[]> {
  const { host, port, useSsl, apiKey, urlBase } = settings as {
    host: string;
    port: number;
    useSsl?: boolean;
    apiKey: string;
    urlBase?: string;
  };
  
  const protocol = useSsl ? 'https' : 'http';
  // urlBase can be empty (API at /api) or a path like /sabnzbd (API at /sabnzbd/api)
  const normalizedUrlBase = urlBase ? `/${urlBase.replace(/^\/|\/$/g, '')}` : '';
  const baseUrl = `${protocol}://${host}:${port}${normalizedUrlBase}/api`;

  // Fetch history (completed downloads)
  const response = await fetch(
    `${baseUrl}?output=json&apikey=${apiKey}&mode=history&limit=100&cat=${encodeURIComponent(category)}`
  );

  if (!response.ok) {
    throw new Error(`SABnzbd API error: ${response.status}`);
  }

  const data = await response.json();
  const slots = data.history?.slots || [];

  // Map SABnzbd history to our format
  return slots
    .filter((s: { status: string }) => s.status === 'Completed')
    .map((s: {
      nzo_id: string;
      name: string;
      storage: string;
      category: string;
      status: string;
    }) => ({
      hash: s.nzo_id,
      name: s.name,
      savePath: s.storage,
      contentPath: s.storage,  // SABnzbd uses storage as the final path
      category: s.category,
      progress: 1.0,
      state: s.status,
    }));
}

async function fetchNZBGetCompleted(
  settings: Record<string, unknown>,
  category: string
): Promise<CompletedDownload[]> {
  const { host, port, useSsl, username, password } = settings as {
    host: string;
    port: number;
    useSsl?: boolean;
    username?: string;
    password?: string;
  };
  
  const protocol = useSsl ? 'https' : 'http';
  const auth = username && password 
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : '';
  
  const baseUrl = `${protocol}://${auth}${host}:${port}/jsonrpc`;

  // Fetch history (completed downloads)
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'history', params: [] }),
  });

  if (!response.ok) {
    throw new Error(`NZBGet API error: ${response.status}`);
  }

  const data = await response.json();
  const items = data.result || [];

  // Filter by category and successful completion
  return items
    .filter((item: { Category: string; Status: string }) => 
      item.Category === category && item.Status === 'SUCCESS'
    )
    .map((item: {
      NZBID: number;
      Name: string;
      DestDir: string;
      Category: string;
      Status: string;
    }) => ({
      hash: `NZBGet_${item.NZBID}`,
      name: item.Name,
      savePath: item.DestDir,
      contentPath: item.DestDir,
      category: item.Category,
      progress: 1.0,
      state: item.Status,
    }));
}
