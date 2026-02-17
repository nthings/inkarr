// Indexers API - GET all, POST new

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import type { IndexerImplementation, IndexerSettings, DownloadProtocol } from '@/app/lib/types';

/**
 * @swagger
 * /api/v1/indexer:
 *   get:
 *     summary: Get all indexers
 *     tags: [Indexers]
 *     responses:
 *       200:
 *         description: List of configured indexers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   implementation: { type: string }
 *                   protocol: { type: string, enum: [usenet, torrent] }
 *                   enableRss: { type: boolean }
 *                   enableAutomaticSearch: { type: boolean }
 *                   enableInteractiveSearch: { type: boolean }
 *                   priority: { type: integer }
 */
export async function GET() {
  try {
    const indexers = await prisma.indexer.findMany({
      include: {
        status: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    // Parse settings JSON for each indexer
    const parsed = indexers.map(indexer => ({
      ...indexer,
      settings: JSON.parse(indexer.settings),
      tags: indexer.tags ? JSON.parse(indexer.tags) : [],
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching indexers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indexers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      implementation,
      protocol,
      settings,
      enableRss = true,
      enableAutomaticSearch = true,
      enableInteractiveSearch = true,
      priority = 25,
      downloadClientId,
      tags,
    }: {
      name: string;
      implementation: IndexerImplementation;
      protocol: DownloadProtocol;
      settings: IndexerSettings;
      enableRss?: boolean;
      enableAutomaticSearch?: boolean;
      enableInteractiveSearch?: boolean;
      priority?: number;
      downloadClientId?: number;
      tags?: number[];
    } = body;

    if (!name || !implementation || !protocol || !settings) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate settings
    if (!settings.baseUrl) {
      return NextResponse.json(
        { error: 'Base URL is required' },
        { status: 400 }
      );
    }

    const indexer = await prisma.indexer.create({
      data: {
        name,
        implementation,
        protocol,
        settings: JSON.stringify(settings),
        enableRss,
        enableAutomaticSearch,
        enableInteractiveSearch,
        priority,
        downloadClientId,
        tags: tags ? JSON.stringify(tags) : null,
      },
    });

    return NextResponse.json({
      ...indexer,
      settings,
      tags: tags || [],
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating indexer:', error);
    return NextResponse.json(
      { error: 'Failed to create indexer' },
      { status: 500 }
    );
  }
}
