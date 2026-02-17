// Metadata Provider Types for Inkarr
// Integrations with ComicVine, MyAnimeList, AniList, MangaDex

import { MediaType, PublicationStatus, Ratings, ExternalIds, CreatorRole } from './media';

export type MetadataProviderType = 
  | 'ComicVine'
  | 'MyAnimeList'
  | 'AniList'
  | 'MangaDex'
  | 'MangaUpdates';

export interface IMetadataProvider {
  id: number;
  name: string;
  implementation: MetadataProviderType;
  settings: MetadataProviderSettings;
  enable: boolean;
  priority: number;
}

// Provider settings
export interface MetadataProviderSettings {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
}

export interface ComicVineSettings extends MetadataProviderSettings {
  apiKey: string;
  baseUrl?: string; // defaults to https://comicvine.gamespot.com/api
}

export interface MyAnimeListSettings extends MetadataProviderSettings {
  clientId: string;
  clientSecret?: string; // For OAuth if needed
}

export interface AniListSettings extends MetadataProviderSettings {
  // AniList uses OAuth
  accessToken?: string;
}

export interface MangaDexSettings extends MetadataProviderSettings {
  // MangaDex is mostly public
  preferredLanguages?: string[];
}

// =============================================================================
// COMICVINE TYPES (based on API response)
// =============================================================================

export interface ComicVineSearchResult {
  aliases: string | null;
  api_detail_url: string;
  count_of_issues: number;
  date_added: string;
  date_last_updated: string;
  deck: string | null;
  description: string | null;
  id: number;
  image: ComicVineImage;
  name: string;
  publisher: ComicVinePublisher | null;
  site_detail_url: string;
  start_year: string | null;
  resource_type: 'volume';
}

export interface ComicVineVolume {
  aliases: string | null;
  api_detail_url: string;
  characters: ComicVineResource[];
  concepts: ComicVineResource[];
  count_of_issues: number;
  date_added: string;
  date_last_updated: string;
  deck: string | null;
  description: string | null;
  first_issue: ComicVineIssue | null;
  id: number;
  image: ComicVineImage;
  issues: ComicVineIssue[];
  last_issue: ComicVineIssue | null;
  locations: ComicVineResource[];
  name: string;
  objects: ComicVineResource[];
  people: ComicVinePerson[];
  publisher: ComicVinePublisher | null;
  site_detail_url: string;
  start_year: string | null;
}

export interface ComicVineIssue {
  aliases: string | null;
  api_detail_url: string;
  cover_date: string | null;
  date_added: string;
  date_last_updated: string;
  deck: string | null;
  description: string | null;
  id: number;
  image: ComicVineImage;
  issue_number: string;
  name: string | null;
  site_detail_url: string;
  store_date: string | null;
  volume: ComicVineVolumeRef;
}

export interface ComicVineImage {
  icon_url: string;
  medium_url: string;
  screen_url: string;
  screen_large_url: string;
  small_url: string;
  super_url: string;
  thumb_url: string;
  tiny_url: string;
  original_url: string;
  image_tags: string;
}

export interface ComicVinePublisher {
  api_detail_url: string;
  id: number;
  name: string;
  site_detail_url: string;
}

export interface ComicVinePerson {
  api_detail_url: string;
  id: number;
  name: string;
  site_detail_url: string;
  role: string;
  count?: string;
}

export interface ComicVineResource {
  api_detail_url: string;
  id: number;
  name: string;
  site_detail_url: string;
  count?: string;
}

export interface ComicVineVolumeRef {
  api_detail_url: string;
  id: number;
  name: string;
  site_detail_url: string;
}

export interface ComicVineApiResponse<T> {
  error: string;
  limit: number;
  offset: number;
  number_of_page_results: number;
  number_of_total_results: number;
  status_code: number;
  results: T;
  version: string;
}

// =============================================================================
// MYANIMELIST TYPES (based on API response)
// =============================================================================

export interface MALMangaSearchResult {
  node: MALMangaNode;
}

export interface MALMangaNode {
  id: number;
  title: string;
  main_picture?: MALPicture;
  alternative_titles?: MALAlternativeTitles;
  start_date?: string;
  end_date?: string;
  synopsis?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  nsfw?: 'white' | 'gray' | 'black';
  media_type?: MALMangaMediaType;
  status?: MALMangaStatus;
  genres?: MALGenre[];
  num_volumes?: number;
  num_chapters?: number;
  authors?: MALAuthor[];
  pictures?: MALPicture[];
  background?: string;
  related_anime?: MALRelatedAnime[];
  related_manga?: MALRelatedManga[];
  recommendations?: MALRecommendation[];
  serialization?: MALSerialization[];
}

export interface MALPicture {
  medium: string;
  large?: string;
}

export interface MALAlternativeTitles {
  synonyms?: string[];
  en?: string;
  ja?: string;
}

export interface MALGenre {
  id: number;
  name: string;
}

export interface MALAuthor {
  node: {
    id: number;
    first_name: string;
    last_name: string;
  };
  role: string;
}

export interface MALRelatedAnime {
  node: {
    id: number;
    title: string;
    main_picture?: MALPicture;
  };
  relation_type: string;
  relation_type_formatted: string;
}

export interface MALRelatedManga {
  node: {
    id: number;
    title: string;
    main_picture?: MALPicture;
  };
  relation_type: string;
  relation_type_formatted: string;
}

export interface MALRecommendation {
  node: {
    id: number;
    title: string;
    main_picture?: MALPicture;
  };
  num_recommendations: number;
}

export interface MALSerialization {
  node: {
    id: number;
    name: string;
  };
}

export type MALMangaMediaType = 
  | 'unknown'
  | 'manga'
  | 'novel'
  | 'one_shot'
  | 'doujinshi'
  | 'manhwa'
  | 'manhua'
  | 'oel'
  | 'light_novel';

export type MALMangaStatus = 
  | 'finished'
  | 'currently_publishing'
  | 'not_yet_published'
  | 'on_hiatus'
  | 'discontinued';

export interface MALSearchResponse {
  data: MALMangaSearchResult[];
  paging: {
    previous?: string;
    next?: string;
  };
}

// =============================================================================
// UNIFIED SEARCH RESULT (normalized from any provider)
// =============================================================================

export interface MetadataSearchResult {
  foreignId: string;
  provider: MetadataProviderType;
  title: string;
  sortTitle: string;
  alternateTitles?: string[];
  overview?: string;
  mediaType: MediaType;
  status: PublicationStatus;
  year?: number;
  publisher?: string;
  genres?: string[];
  ratings?: Ratings;
  imageUrl?: string;
  bannerUrl?: string;
  volumeCount?: number;
  chapterCount?: number;
  externalIds: ExternalIds;
  creators?: MetadataCreator[];
}

export interface MetadataCreator {
  foreignId?: string;
  name: string;
  role: CreatorRole;
  imageUrl?: string;
}

// Mapping functions types
export type MapComicVineToSeries = (volume: ComicVineVolume) => MetadataSearchResult;
export type MapMALToSeries = (manga: MALMangaNode) => MetadataSearchResult;

// Function to map MAL media type to our MediaType
export function mapMALMediaType(malType?: MALMangaMediaType): MediaType {
  switch (malType) {
    case 'manhwa':
      return MediaType.MANHWA;
    case 'manhua':
      return MediaType.MANHUA;
    case 'manga':
    case 'doujinshi':
    case 'one_shot':
    default:
      return MediaType.MANGA;
  }
}

// Function to map MAL status to our PublicationStatus
export function mapMALStatus(malStatus?: MALMangaStatus): PublicationStatus {
  switch (malStatus) {
    case 'finished':
      return PublicationStatus.ENDED;
    case 'currently_publishing':
      return PublicationStatus.CONTINUING;
    case 'not_yet_published':
      return PublicationStatus.UPCOMING;
    case 'on_hiatus':
      return PublicationStatus.HIATUS;
    case 'discontinued':
      return PublicationStatus.CANCELLED;
    default:
      return PublicationStatus.CONTINUING;
  }
}

// Function to check if ComicVine volume is likely a comic vs manga
export function inferMediaTypeFromPublisher(publisher?: string): MediaType {
  const mangaPublishers = [
    'viz media', 'kodansha', 'shueisha', 'shogakukan', 
    'square enix', 'kadokawa', 'seven seas', 'yen press',
    'dark horse manga', 'vertical', 'j-novel club'
  ];
  
  if (publisher) {
    const lowerPublisher = publisher.toLowerCase();
    if (mangaPublishers.some(p => lowerPublisher.includes(p))) {
      return MediaType.MANGA;
    }
  }
  
  return MediaType.COMIC;
}
