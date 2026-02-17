// Anonymous usage statistics collection and sending

import prisma from './db';
import logger from './logger';
import { randomUUID } from 'crypto';
import os from 'os';
import packageJson from '../../package.json';

const STATISTICS_URL = 'https://inkarr-statistics.ngrok.dev';

interface AnonymousStatistics {
  // Installation identification (random UUID, no personal info)
  installationId: string;
  
  // App info
  version: string;
  
  // System info (anonymous)
  platform: string;  // darwin, linux, win32
  arch: string;      // x64, arm64
  nodeVersion: string;
  
  // Library statistics (counts only)
  seriesCount: number;
  volumeCount: number;
  chapterCount: number;
  mediaFileCount: number;
  
  // Feature usage (counts and flags)
  indexerCount: number;
  downloadClientCount: number;
  rootFolderCount: number;
  userCount: number;
  
  // Settings (no sensitive data)
  authEnabled: boolean;
  autoImportEnabled: boolean;
  calibreEnabled: boolean;
  
  // Database info
  databaseType: string;
  
  // Timestamp
  timestamp: string;
}

// Get or create installation ID
async function getInstallationId(): Promise<string> {
  const existing = await prisma.config.findUnique({
    where: { key: 'InstallationId' },
  });
  
  if (existing?.value) {
    return existing.value;
  }
  
  const newId = randomUUID();
  await prisma.config.upsert({
    where: { key: 'InstallationId' },
    update: { value: newId },
    create: { key: 'InstallationId', value: newId },
  });
  
  return newId;
}

// Collect anonymous statistics
export async function collectStatistics(): Promise<AnonymousStatistics> {
  const [
    installationId,
    seriesCount,
    volumeCount,
    chapterCount,
    mediaFileCount,
    indexerCount,
    downloadClientCount,
    rootFolderCount,
    userCount,
    authConfig,
    autoImportConfig,
    calibreConfig,
  ] = await Promise.all([
    getInstallationId(),
    prisma.series.count(),
    prisma.volume.count(),
    prisma.chapter.count(),
    prisma.mediaFile.count(),
    prisma.indexer.count(),
    prisma.downloadClient.count(),
    prisma.rootFolder.count(),
    prisma.user.count(),
    prisma.config.findUnique({ where: { key: 'AuthenticationMethod' } }),
    prisma.config.findUnique({ where: { key: 'AutoImportEnabled' } }),
    prisma.config.findUnique({ where: { key: 'CalibreEnabled' } }),
  ]);
  
  return {
    installationId,
    version: packageJson.version,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    seriesCount,
    volumeCount,
    chapterCount,
    mediaFileCount,
    indexerCount,
    downloadClientCount,
    rootFolderCount,
    userCount,
    authEnabled: authConfig?.value !== 'none' && authConfig?.value !== undefined,
    autoImportEnabled: autoImportConfig?.value === 'true',
    calibreEnabled: calibreConfig?.value === 'true',
    databaseType: 'sqlite',
    timestamp: new Date().toISOString(),
  };
}

// Send statistics to the server
export async function sendStatistics(): Promise<boolean> {
  try {
    const stats = await collectStatistics();
    
    const response = await fetch(`${STATISTICS_URL}/api/v1/statistics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Inkarr/${stats.version}`,
      },
      body: JSON.stringify(stats),
    });
    
    if (!response.ok) {
      logger.warn(`Failed to send statistics: ${response.status}`, 'Statistics');
      return false;
    }
    
    logger.debug('Statistics sent successfully', 'Statistics');
    return true;
  } catch (error) {
    logger.warn('Failed to send statistics', 'Statistics', error);
    return false;
  }
}

export default {
  collect: collectStatistics,
  send: sendStatistics,
};
