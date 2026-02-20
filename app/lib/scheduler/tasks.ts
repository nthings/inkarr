// Scheduled Task Definitions
// Each task runs at a configurable interval to perform background operations

import prisma from '@/app/lib/db';
import { resolveToLocal } from '@/app/lib/path-mapping';

// Task execution context
export interface TaskContext {
  taskName: string;
  lastExecution: Date | null;
  interval: number; // minutes
}

// Task result for logging
export interface TaskResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Task configuration keys (stored in Config table)
export const TASK_CONFIG_KEYS = {
  // Auto-import completed downloads
  AUTO_IMPORT_ENABLED: 'AutoImportEnabled',
  AUTO_IMPORT_INTERVAL: 'AutoImportInterval', // minutes
  AUTO_IMPORT_DELAY: 'AutoImportDelay', // minutes to wait after download completes
  
  // Download queue monitoring
  QUEUE_CHECK_ENABLED: 'QueueCheckEnabled',
  QUEUE_CHECK_INTERVAL: 'QueueCheckInterval', // minutes
  
  // RSS sync from indexers
  RSS_SYNC_ENABLED: 'RssSyncEnabled',
  RSS_SYNC_INTERVAL: 'RssSyncInterval', // minutes
  
  // Search for monitored items
  SEARCH_MONITORED_ENABLED: 'SearchMonitoredEnabled',
  SEARCH_MONITORED_INTERVAL: 'SearchMonitoredInterval', // minutes
  
  // Refresh series metadata
  REFRESH_SERIES_ENABLED: 'RefreshSeriesEnabled',
  REFRESH_SERIES_INTERVAL: 'RefreshSeriesInterval', // hours
  
  // Send anonymous statistics
  SEND_STATISTICS_ENABLED: 'SendStatisticsEnabled',
  SEND_STATISTICS_INTERVAL: 'SendStatisticsInterval', // minutes
};

// Task definitions with default intervals
export const SCHEDULED_TASKS = {
  AutoImport: {
    name: 'AutoImport',
    description: 'Import completed downloads to library',
    defaultInterval: 15, // minutes
    enabledKey: TASK_CONFIG_KEYS.AUTO_IMPORT_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.AUTO_IMPORT_INTERVAL,
  },
  QueueCheck: {
    name: 'QueueCheck',
    description: 'Check download queue for completed items',
    defaultInterval: 5, // minutes
    enabledKey: TASK_CONFIG_KEYS.QUEUE_CHECK_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.QUEUE_CHECK_INTERVAL,
  },
  RssSync: {
    name: 'RssSync',
    description: 'Sync RSS feeds from indexers',
    defaultInterval: 60, // minutes
    enabledKey: TASK_CONFIG_KEYS.RSS_SYNC_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.RSS_SYNC_INTERVAL,
  },
  SearchMonitored: {
    name: 'SearchMonitored',
    description: 'Search for missing monitored items',
    defaultInterval: 720, // 12 hours in minutes
    enabledKey: TASK_CONFIG_KEYS.SEARCH_MONITORED_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.SEARCH_MONITORED_INTERVAL,
  },
  RefreshSeries: {
    name: 'RefreshSeries',
    description: 'Refresh series metadata from sources',
    defaultInterval: 1440, // 24 hours in minutes  
    enabledKey: TASK_CONFIG_KEYS.REFRESH_SERIES_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.REFRESH_SERIES_INTERVAL,
  },
  SendStatistics: {
    name: 'SendStatistics',
    description: 'Send anonymous usage statistics',
    defaultInterval: 1440, // 24 hours in minutes
    enabledKey: TASK_CONFIG_KEYS.SEND_STATISTICS_ENABLED,
    intervalKey: TASK_CONFIG_KEYS.SEND_STATISTICS_INTERVAL,
  },
};

/**
 * Task: Auto Import
 * Imports completed downloads from the download folder to the library
 */
export async function executeAutoImport(context: TaskContext): Promise<TaskResult> {
  const { scanDirectory, importFiles } = await import('@/app/lib/import');
  
  // Get configuration
  let downloadPath = await getConfigValue('DownloadsFolder', '/data/downloads');
  const category = await getConfigValue('DownloadsCategory', '');
  const deleteSource = await getConfigValue('DeleteSourceAfterImport', 'true') === 'true';
  const copyMode = await getConfigValue('CopyModeEnabled', 'false') === 'true';
  // Check if we should filter by download client category (only import files from inkarr-tagged downloads)
  const filterByDownloadClient = await getConfigValue('FilterByDownloadClient', 'true') === 'true';
  
  // Append category subfolder if configured
  if (category) {
    downloadPath = `${downloadPath}/${category}`;
  }
  
  // Get root folder
  const rootFolder = await prisma.rootFolder.findFirst({
    orderBy: { id: 'asc' },
  });
  
  if (!rootFolder) {
    return {
      success: false,
      message: 'No root folder configured',
    };
  }
  
  // Resolve paths to local filesystem
  const localDownloadPath = resolveToLocal(downloadPath);
  const localRootPath = resolveToLocal(rootFolder.path);
  
  try {
    // Scan downloads folder - filter by download client category if enabled
    const files = await scanDirectory(localDownloadPath, localDownloadPath, true, { filterByDownloadClient });
    
    if (files.length === 0) {
      return {
        success: true,
        message: 'No files to import',
        details: { scannedPath: downloadPath },
      };
    }
    
    // Import files
    const result = await importFiles(files, {
      rootFolderPath: localRootPath,
      deleteSource,
      copyMode,
    });
    
    return {
      success: result.success,
      message: `Imported ${result.imported} files, ${result.failed} failed`,
      details: {
        imported: result.imported,
        failed: result.failed,
        errors: result.errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error}`,
    };
  }
}

/**
 * Task: Queue Check
 * Checks download queue for completed downloads and triggers import
 */
export async function executeQueueCheck(context: TaskContext): Promise<TaskResult> {
  try {
    // Get all enabled download clients
    const clients = await prisma.downloadClient.findMany({
      where: { enable: true },
    });
    
    if (clients.length === 0) {
      return {
        success: true,
        message: 'No download clients configured',
      };
    }
    
    // Get queue items from database that are marked as downloading
    const queueItems = await prisma.queueItem.findMany({
      where: {
        status: { in: ['DOWNLOADING', 'QUEUED'] },
      },
    });
    
    // Update queue item statuses by checking with download clients
    let completedCount = 0;
    
    for (const item of queueItems) {
      // Check if item is still in download client queue
      // This would require calling the download client API
      // For now, just log that we're checking
      console.log(`[QueueCheck] Checking status of: ${item.title}`);
    }
    
    return {
      success: true,
      message: `Checked ${queueItems.length} queue items`,
      details: {
        checked: queueItems.length,
        completed: completedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Queue check failed: ${error}`,
    };
  }
}

/**
 * Task: RSS Sync
 * Syncs RSS feeds from all enabled indexers
 */
export async function executeRssSync(context: TaskContext): Promise<TaskResult> {
  try {
    // Get indexers with RSS enabled
    const indexers = await prisma.indexer.findMany({
      where: {
        enableRss: true,
      },
    });
    
    if (indexers.length === 0) {
      return {
        success: true,
        message: 'No RSS-enabled indexers configured',
      };
    }
    
    let totalReleases = 0;
    let processedIndexers = 0;
    const errors: string[] = [];
    
    for (const indexer of indexers) {
      try {
        // Fetch RSS feed from indexer
        const settings = JSON.parse(indexer.settings);
        const releases = await fetchRssFeed(indexer.implementation, settings);
        
        // Process releases against monitored series
        const processed = await processRssReleases(releases);
        totalReleases += processed;
        processedIndexers++;
        
        // Update indexer status with last RSS sync info
        await prisma.indexerStatus.upsert({
          where: { indexerId: indexer.id },
          update: {
            lastRssSyncReleaseInfo: releases.length > 0 ? JSON.stringify(releases[0]) : null,
          },
          create: {
            indexerId: indexer.id,
            lastRssSyncReleaseInfo: releases.length > 0 ? JSON.stringify(releases[0]) : null,
          },
        });
      } catch (error) {
        errors.push(`${indexer.name}: ${error}`);
      }
    }
    
    return {
      success: errors.length === 0,
      message: `Synced ${processedIndexers}/${indexers.length} indexers, found ${totalReleases} releases`,
      details: {
        indexers: processedIndexers,
        releases: totalReleases,
        errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `RSS sync failed: ${error}`,
    };
  }
}

/**
 * Task: Search Monitored
 * Searches for missing monitored series, volumes, chapters
 */
export async function executeSearchMonitored(context: TaskContext): Promise<TaskResult> {
  try {
    const { searchAllMissing } = await import('./auto-search');
    
    // Get configuration for max searches per run
    const maxSearchesConfig = await getConfigValue('SearchMonitoredMaxSearches', '10');
    const maxSearches = parseInt(maxSearchesConfig, 10) || 10;
    
    const result = await searchAllMissing({
      maxSearches,
      searchDelayMs: 2000,
      autoGrab: true,
    });
    
    return {
      success: true,
      message: `Searched ${result.searched} items, grabbed ${result.grabbed}`,
      details: {
        searched: result.searched,
        grabbed: result.grabbed,
        results: result.results.map(r => ({
          series: r.seriesTitle,
          volume: r.volumeNumber,
          releasesFound: r.releases.length,
          grabbed: r.grabbed,
          error: r.error,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Search monitored failed: ${error}`,
    };
  }
}

/**
 * Task: Refresh Series
 * Refreshes metadata for all series from external sources and pre-fetches cover images
 */
export async function executeRefreshSeries(context: TaskContext): Promise<TaskResult> {
  try {
    const { prefetchSeriesCovers } = await import('@/app/lib/image-cache');
    
    const series = await prisma.series.findMany({
      where: {
        monitored: true,
      },
      include: {
        volumes: {
          select: { imageUrl: true },
        },
      },
    });
    
    let refreshedCount = 0;
    let imagesCached = 0;
    let imagesSkipped = 0;
    let imagesFailed = 0;
    
    for (const s of series) {
      // TODO: Implement metadata refresh from external sources (MAL, AniList, etc.)
      await prisma.series.update({
        where: { id: s.id },
        data: { lastInfoSync: new Date() },
      });
      refreshedCount++;
      
      // Pre-fetch cover images for this series
      const imageResult = await prefetchSeriesCovers({
        imageUrl: s.imageUrl,
        volumes: s.volumes,
      });
      imagesCached += imageResult.cached;
      imagesSkipped += imageResult.skipped;
      imagesFailed += imageResult.failed;
    }
    
    return {
      success: true,
      message: `Refreshed ${refreshedCount} series, cached ${imagesCached} images`,
      details: { 
        refreshed: refreshedCount,
        images: {
          cached: imagesCached,
          skipped: imagesSkipped,
          failed: imagesFailed,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Refresh series failed: ${error}`,
    };
  }
}

/**
 * Task: Send Statistics
 * Sends anonymous usage statistics to help improve Inkarr
 */
export async function executeSendStatistics(context: TaskContext): Promise<TaskResult> {
  try {
    const { sendStatistics, collectStatistics } = await import('@/app/lib/statistics');
    
    const stats = await collectStatistics();
    const sent = await sendStatistics();
    
    if (sent) {
      return {
        success: true,
        message: 'Statistics sent successfully',
        details: {
          seriesCount: stats.seriesCount,
          volumeCount: stats.volumeCount,
          mediaFileCount: stats.mediaFileCount,
        },
      };
    } else {
      return {
        success: false,
        message: 'Failed to send statistics',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Send statistics failed: ${error}`,
    };
  }
}

// Helper functions

async function getConfigValue(key: string, defaultValue: string): Promise<string> {
  const config = await prisma.config.findUnique({ where: { key } });
  return config?.value ?? defaultValue;
}

async function fetchRssFeed(implementation: string, settings: Record<string, any>): Promise<any[]> {
  // Implementation depends on indexer type
  const { baseUrl, apiKey } = settings;
  
  // For Torznab/Newznab indexers
  const url = new URL(`${baseUrl}/api`);
  url.searchParams.set('t', 'search');
  url.searchParams.set('apikey', apiKey);
  
  // Add manga/comic categories if configured
  if (settings.categories?.length > 0) {
    url.searchParams.set('cat', settings.categories.join(','));
  }
  
  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    
    const text = await response.text();
    // Parse XML response - simplified, real implementation would use xml2js
    return [];
  } catch {
    return [];
  }
}

async function processRssReleases(releases: any[]): Promise<number> {
  // Match releases against monitored series and auto-grab if configured
  // This is a simplified implementation
  return releases.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
