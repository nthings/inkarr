// Shared configuration defaults
// Used by both Config API and Scheduler to ensure consistent defaults

export const CONFIG_DEFAULTS: Record<string, string> = {
  // General/Security settings
  ApiKey: '', // Will be generated on first access if empty
  AuthenticationMethod: 'none', // none, forms
  LogLevel: 'info', // trace, debug, info, warn, error
  
  // Download/Import settings
  DownloadsFolder: './data/downloads',
  DeleteSourceAfterImport: 'true',
  CopyModeEnabled: 'false',
  
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
