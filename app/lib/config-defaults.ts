// Shared configuration defaults
// Used by both Config API and Scheduler to ensure consistent defaults
//
// PATH MAPPING (for non-Docker environments):
// When running outside Docker, database paths (e.g., /data/comics) need to be
// mapped to local filesystem paths. Configure via environment variables:
//
// Option 1: Single mapping string (comma-separated for multiple mappings)
//   INKARR_PATH_MAPPING="/data/comics=./data/comics,/data/manga=./data/manga"
//
// Option 2: Simple prefix replacement (for common case where all paths share a prefix)
//   INKARR_PATH_PREFIX_DOCKER=/data
//   INKARR_PATH_PREFIX_LOCAL=./data
//
// When running in Docker, leave these variables unset (paths work as-is).

export const CONFIG_DEFAULTS: Record<string, string> = {
  // General/Security settings
  ApiKey: '', // Will be generated on first access if empty
  AuthenticationMethod: 'none', // none, forms
  LogLevel: 'info', // trace, debug, info, warn, error
  
  // Download/Import settings
  DownloadsFolder: '/data/downloads',
  DownloadsCategory: '', // Subfolder within downloads to scan (e.g., 'inkarr' scans /data/downloads/inkarr)
  DownloadClientCategory: 'inkarr', // Category/tag used by download clients - only imports from downloads with this tag
  FilterByDownloadClient: 'true', // Only import files that are in downloads tagged with DownloadClientCategory
  DeleteSourceAfterImport: 'true',
  CopyModeEnabled: 'false',
  RequireVolumeMatch: 'true', // Only import files that match existing volumes from metadata provider
  
  // AutoImport task - imports completed downloads to library
  AutoImportEnabled: 'false',
  AutoImportInterval: '15', // minutes
  AutoImportDelay: '5', // minutes to wait after download completes
  
  // QueueCheck task - monitors download queue for completed items
  QueueCheckEnabled: 'false',
  QueueCheckInterval: '5', // minutes
  
  // RssSync task - syncs RSS feeds from indexers
  RssSyncEnabled: 'false',
  RssSyncInterval: '60', // minutes
  
  // SearchMonitored task - searches for missing monitored items
  SearchMonitoredEnabled: 'false',
  SearchMonitoredInterval: '720', // 12 hours in minutes
  SearchMonitoredMaxSearches: '10', // max items to search per run
  
  // RefreshSeries task - refreshes series metadata
  RefreshSeriesEnabled: 'false',
  RefreshSeriesInterval: '1440', // 24 hours in minutes
  
  // SendStatistics task - sends anonymous usage statistics
  SendStatisticsEnabled: 'true', // enabled by default
  SendStatisticsInterval: '1440', // 24 hours in minutes
};

// Helper to get a config value with default
export function getConfigDefault(key: string): string | undefined {
  return CONFIG_DEFAULTS[key];
}
