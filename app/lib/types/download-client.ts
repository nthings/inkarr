// Download Client Types for Inkarr
// Based on Readarr/Sonarr/Radarr download client abstraction

export enum DownloadProtocol {
  USENET = 'USENET',
  TORRENT = 'TORRENT',
}

export enum DownloadItemStatus {
  QUEUED = 'QUEUED',
  PAUSED = 'PAUSED',
  DOWNLOADING = 'DOWNLOADING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  WARNING = 'WARNING',
}

// Download Client interface (abstraction layer)
export interface IDownloadClient {
  id: number;
  name: string;
  implementation: DownloadClientType;
  protocol: DownloadProtocol;
  settings: DownloadClientSettings;
  enable: boolean;
  priority: number;
  removeCompletedDownloads: boolean;
  removeFailedDownloads: boolean;
  tags?: number[];
}

export type DownloadClientType =
  | 'QBittorrent'
  | 'Transmission'
  | 'Deluge'
  | 'rTorrent'
  | 'uTorrent'
  | 'Aria2'
  | 'Flood'
  | 'SABnzbd'
  | 'NZBGet'
  | 'NZBVortex'
  | 'Pneumatic'
  | 'Blackhole';

// Base settings interface
export interface DownloadClientSettings {
  host: string;
  port: number;
  useSsl?: boolean;
  urlBase?: string;
}

// qBittorrent settings
export interface QBittorrentSettings extends DownloadClientSettings {
  username?: string;
  password?: string;
  category?: string;
  postImportCategory?: string;
  recentPriority?: 'last' | 'first';
  olderPriority?: 'last' | 'first';
  initialState?: 'start' | 'pause' | 'forceStart';
  sequentialOrder?: boolean;
  firstAndLastFirst?: boolean;
  contentLayout?: 'original' | 'subfolder' | 'noSubfolder';
}

// Transmission settings
export interface TransmissionSettings extends DownloadClientSettings {
  username?: string;
  password?: string;
  category?: string;
  directory?: string;
  recentPriority?: 'last' | 'first';
  olderPriority?: 'last' | 'first';
  addPaused?: boolean;
}

// Deluge settings
export interface DelugeSettings extends DownloadClientSettings {
  password?: string;
  category?: string;
  postImportCategory?: string;
  recentPriority?: 'last' | 'first';
  olderPriority?: 'last' | 'first';
  addPaused?: boolean;
}

// SABnzbd settings
export interface SABnzbdSettings extends DownloadClientSettings {
  apiKey: string;
  category?: string;
  recentPriority?: -100 | -3 | -2 | -1 | 0 | 1 | 2; // force, low, normal, high
  olderPriority?: -100 | -3 | -2 | -1 | 0 | 1 | 2;
}

// NZBGet settings
export interface NZBGetSettings extends DownloadClientSettings {
  username: string;
  password: string;
  category?: string;
  recentPriority?: number; // -100 to 100
  olderPriority?: number;
  addPaused?: boolean;
}

// Download client item (from client API)
export interface DownloadClientItem {
  downloadId: string;
  title: string;
  totalSize: number;
  remainingSize: number;
  remainingTime?: number; // seconds
  status: DownloadItemStatus;
  message?: string;
  outputPath?: string;
  category?: string;
  canBeRemoved: boolean;
  canMoveFiles: boolean;
  isEncrypted?: boolean;
  seedRatio?: number;
}

// Download client status
export interface DownloadClientStatus {
  id: number;
  downloadClientId: number;
  initialFailure?: Date;
  mostRecentFailure?: Date;
  escalationLevel: number;
  disabledTill?: Date;
}

// Download client info
export interface DownloadClientInfo {
  isLocalhost: boolean;
  outputRootFolders: string[];
}

// Remote file mapping
export interface RemotePathMapping {
  id: number;
  host: string;
  remotePath: string;
  localPath: string;
}

// Download request
export interface DownloadRequest {
  indexerId: number;
  release: ReleaseInfo;
  seriesId?: number;
  volumeId?: number;
  chapterId?: number;
}

export interface ReleaseInfo {
  guid: string;
  title: string;
  indexer: string;
  indexerId: number;
  downloadUrl: string;
  infoUrl?: string;
  commentUrl?: string;
  publishDate: Date;
  size: number;
  protocol: DownloadProtocol;
  
  // Torrent specific
  seeders?: number;
  leechers?: number;
  infoHash?: string;
  magnetUrl?: string;
  
  // Parsed info
  seriesTitle?: string;
  volumeNumber?: number;
  chapterNumbers?: number[];
  quality?: string;
  releaseGroup?: string;
  
  // Indexer flags
  indexerFlags?: IndexerFlag[];
}

export enum IndexerFlag {
  G_FREELEECH = 'G_Freeleech',
  G_HALFLEECH = 'G_Halfleech',
  G_DOUBLEUPLOAD = 'G_DoubleUpload',
  SCENE = 'Scene',
  FREELEECH = 'Freeleech',
  INTERNAL = 'Internal',
}

// Grab release response
export interface GrabReleaseResponse {
  grabbed: boolean;
  downloadClientItem?: DownloadClientItem;
  rejections?: string[];
}
