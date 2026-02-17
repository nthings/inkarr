// System Status API

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';

/**
 * @swagger
 * /api/v1/system/status:
 *   get:
 *     summary: Get system status and statistics
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appName: { type: string }
 *                 version: { type: string }
 *                 osName: { type: string }
 *                 runtimeVersion: { type: string }
 *                 databaseType: { type: string }
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     seriesCount: { type: integer }
 *                     volumeCount: { type: integer }
 *                     chapterCount: { type: integer }
 *                     mediaFileCount: { type: integer }
 *                     indexerCount: { type: integer }
 *                     downloadClientCount: { type: integer }
 */
export async function GET() {
  try {
    // Get counts from database
    const [
      seriesCount,
      volumeCount,
      chapterCount,
      mediaFileCount,
      indexerCount,
      downloadClientCount,
    ] = await Promise.all([
      prisma.series.count(),
      prisma.volume.count(),
      prisma.chapter.count(),
      prisma.mediaFile.count(),
      prisma.indexer.count(),
      prisma.downloadClient.count(),
    ]);

    return NextResponse.json({
      appName: 'Inkarr',
      version: '0.0.1',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      isDebug: process.env.NODE_ENV !== 'production',
      isProduction: process.env.NODE_ENV === 'production',
      isAdmin: true,
      isUserInteractive: true,
      startupPath: process.cwd(),
      appData: process.env.INKARR_DATA || process.cwd(),
      osName: process.platform,
      osVersion: process.version,
      runtimeName: 'Node.js',
      runtimeVersion: process.version,
      databaseType: 'SQLite',
      statistics: {
        seriesCount,
        volumeCount,
        chapterCount,
        mediaFileCount,
        indexerCount,
        downloadClientCount,
      },
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    return NextResponse.json(
      { error: 'Failed to get system status' },
      { status: 500 }
    );
  }
}
