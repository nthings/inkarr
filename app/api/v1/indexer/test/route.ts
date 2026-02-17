// Indexer Test/Capabilities API

import { NextRequest, NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';
import prisma from '@/app/lib/db';
import type { IndexerCapabilities, IndexerCategory } from '@/app/lib/types';

// Debug logging helper - controlled by DEBUG_LOGGING env var
const debug = (...args: unknown[]) => {
  if (process.env.DEBUG_LOGGING === 'true') {
    console.log('[DEBUG]', ...args);
  }
};

/**
 * @swagger
 * /api/v1/indexer/test:
 *   post:
 *     summary: Test indexer connection and get capabilities
 *     tags: [Indexers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   id: { type: integer, description: Existing indexer ID }
 *               - type: object
 *                 required:
 *                   - implementation
 *                   - settings
 *                 properties:
 *                   implementation: { type: string }
 *                   settings:
 *                     type: object
 *                     properties:
 *                       baseUrl: { type: string }
 *                       apiKey: { type: string }
 *     responses:
 *       200:
 *         description: Test result with capabilities
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    let implementation: string;
    let settings: { baseUrl: string; apiPath?: string; apiKey?: string };

    // Support both id-based lookup and direct settings
    if (body.id) {
      const indexer = await prisma.indexer.findUnique({
        where: { id: body.id },
      });
      if (!indexer) {
        return NextResponse.json(
          { success: false, message: 'Indexer not found' },
          { status: 404 }
        );
      }
      implementation = indexer.implementation;
      settings = JSON.parse(indexer.settings);
    } else {
      implementation = body.implementation;
      settings = body.settings;
    }

    if (!implementation || !settings?.baseUrl) {
      return NextResponse.json(
        { success: false, message: 'Missing implementation or settings' },
        { status: 400 }
      );
    }

    const result = await testIndexer(implementation, settings);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Successfully connected to indexer',
        capabilities: result.capabilities,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error testing indexer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to test indexer connection' },
      { status: 500 }
    );
  }
}

async function testIndexer(
  implementation: string,
  settings: { baseUrl: string; apiPath?: string; apiKey?: string }
): Promise<{ success: boolean; capabilities?: IndexerCapabilities; error?: string }> {
  const { baseUrl, apiPath, apiKey } = settings;
  
  try {
    let capsUrl: string;
    
    switch (implementation) {
      case 'Newznab':
      case 'Torznab': {
        // Standard Newznab/Torznab capabilities endpoint
        // Use apiPath if provided, otherwise default to /api
        const path = apiPath !== undefined ? apiPath : '/api';
        capsUrl = `${baseUrl}${path}?t=caps`;
        if (apiKey) {
          capsUrl += `&apikey=${apiKey}`;
        }
        break;
      }
      
      case 'Nyaa': {
        // Nyaa doesn't have caps, return default
        return {
          success: true,
          capabilities: {
            supportsRss: true,
            supportsSearch: true,
            supportsBookSearch: false,
            supportedCategories: [
              { id: 3, name: 'Literature', subCategories: [
                { id: 31, name: 'English-translated' },
                { id: 32, name: 'Non-English-translated' },
                { id: 33, name: 'Raw' },
              ]},
            ],
          },
        };
      }
      
      case 'UNIT3D': {
        // Test UNIT3D API by fetching a single result
        const testUrl = `${baseUrl}/api/torrents/filter?api_token=${apiKey}&perPage=1`;
        debug(`[UNIT3D Test] URL: ${testUrl.replace(apiKey || '', '***')}`);
        
        const response = await fetch(testUrl, {
          headers: {
            'User-Agent': 'Inkarr/1.0',
            'Accept': 'application/json',
          },
        });
        
        debug(`[UNIT3D Test] Status: ${response.status}`);
        
        if (!response.ok) {
          return { success: false, error: `HTTP error: ${response.status}` };
        }
        
        const data = await response.json();
        debug(`[UNIT3D Test] Response has data: ${data.data !== undefined}`);
        
        // Check if we got a valid UNIT3D response
        if (data.data !== undefined) {
          return {
            success: true,
            capabilities: {
              supportsRss: true,
              supportsSearch: true,
              supportsBookSearch: false,
              supportedCategories: [], // UNIT3D doesn't expose categories via API
            },
          };
        } else {
          return { success: false, error: 'Invalid UNIT3D response' };
        }
      }
      
      default:
        return { success: false, error: `Unknown implementation: ${implementation}` };
    }

    debug(`[Caps Test] URL: ${capsUrl.replace(apiKey || '', '***')}`);

    const response = await fetch(capsUrl, {
      headers: {
        'User-Agent': 'Inkarr/1.0',
      },
    });

    debug(`[Caps Test] Status: ${response.status}`);

    if (!response.ok) {
      return { success: false, error: `HTTP error: ${response.status}` };
    }

    const xml = await response.text();
    debug(`[Caps Test] Response (first 500 chars):`, xml.substring(0, 500));
    
    const capabilities = await parseCapabilities(xml);
    
    return { success: true, capabilities };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function parseCapabilities(xml: string): Promise<IndexerCapabilities> {
  try {
    const result = await parseStringPromise(xml, { explicitArray: false });
    const caps = result.caps;

    const categories: IndexerCategory[] = [];
    
    if (caps.categories?.category) {
      const cats = Array.isArray(caps.categories.category) 
        ? caps.categories.category 
        : [caps.categories.category];
      
      for (const cat of cats) {
        const category: IndexerCategory = {
          id: parseInt(cat.$.id, 10),
          name: cat.$.name,
        };
        
        if (cat.subcat) {
          const subcats = Array.isArray(cat.subcat) ? cat.subcat : [cat.subcat];
          category.subCategories = subcats.map((sub: any) => ({
            id: parseInt(sub.$.id, 10),
            name: sub.$.name,
          }));
        }
        
        categories.push(category);
      }
    }

    const searching = caps.searching || {};
    const supportsSearch = searching.search?.$.available === 'yes';
    const supportsBookSearch = searching['book-search']?.$.available === 'yes';

    return {
      supportsRss: true, // Assume RSS is always supported
      supportsSearch,
      supportsBookSearch,
      supportedCategories: categories,
      maxPageSize: caps.limits?.$?.max ? parseInt(caps.limits.$.max, 10) : undefined,
    };
  } catch {
    // Return minimal capabilities if parsing fails
    return {
      supportsRss: true,
      supportsSearch: true,
      supportsBookSearch: false,
      supportedCategories: [],
    };
  }
}
