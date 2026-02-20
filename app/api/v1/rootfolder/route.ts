// Root Folders API

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { stat, statfs } from 'fs/promises';
import { resolveToLocal, resolveToDb } from '@/app/lib/path-mapping';

async function getFreeSpace(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    // freeSpace = available blocks * block size
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/**
 * @swagger
 * /api/v1/rootfolder:
 *   get:
 *     summary: Get all root folders
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: List of root folders with accessibility and free space info
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   path: { type: string }
 *                   name: { type: string }
 *                   mediaType: { type: string, enum: [COMIC, MANGA, MANHWA, MANHUA, WEBTOON] }
 *                   accessible: { type: boolean }
 *                   freeSpace: { type: integer, nullable: true }
 */
export async function GET() {
  try {
    const rootFolders = await prisma.rootFolder.findMany({
      orderBy: {
        path: 'asc',
      },
    });

    // Add free space info for each folder
    const foldersWithSpace = await Promise.all(
      rootFolders.map(async (folder) => {
        try {
          // Use path mapping to resolve DB path to local filesystem path
          const localPath = resolveToLocal(folder.path);
          const stats = await stat(localPath);
          const freeSpace = await getFreeSpace(localPath);
          return {
            ...folder,
            accessible: stats.isDirectory(),
            freeSpace,
          };
        } catch {
          return {
            ...folder,
            accessible: false,
            freeSpace: null,
          };
        }
      })
    );

    return NextResponse.json(foldersWithSpace);
  } catch (error) {
    console.error('Error fetching root folders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch root folders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      path,
      name,
      mediaType = 'MANGA',
      defaultMonitorOption = 'ALL',
      defaultQualityProfileId,
      defaultMetadataProfileId,
    }: {
      path: string;
      name?: string;
      mediaType?: 'COMIC' | 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
      defaultMonitorOption?: string;
      defaultQualityProfileId?: number;
      defaultMetadataProfileId?: number;
    } = body;

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Resolve input path to local filesystem path for validation
    const localPath = resolveToLocal(path);
    // Convert to DB path for storage (handles reverse mapping if user provided local path)
    const dbPath = resolveToDb(path);

    // Check if path exists and is a directory
    try {
      const stats = await stat(localPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: 'Path is not a directory' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Path does not exist or is not accessible' },
        { status: 400 }
      );
    }

    // Check if already exists (check both original and DB path)
    const existing = await prisma.rootFolder.findFirst({
      where: { 
        OR: [
          { path: path },
          { path: dbPath },
        ]
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Root folder already exists' },
        { status: 409 }
      );
    }

    const rootFolder = await prisma.rootFolder.create({
      data: {
        path,
        name: name || path.split('/').pop() || path,
        mediaType: mediaType as any,
        defaultMonitorOption: defaultMonitorOption as any,
        defaultQualityProfileId,
        defaultMetadataProfileId,
      },
    });

    return NextResponse.json(rootFolder, { status: 201 });
  } catch (error) {
    console.error('Error creating root folder:', error);
    return NextResponse.json(
      { error: 'Failed to create root folder' },
      { status: 500 }
    );
  }
}
