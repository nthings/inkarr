// System Statistics API - Anonymous usage data for improving Inkarr

import { NextResponse } from 'next/server';
import { collectStatistics, sendStatistics } from '@/app/lib/statistics';
import logger from '@/app/lib/logger';

/**
 * @swagger
 * /api/v1/system/statistics:
 *   get:
 *     summary: Preview anonymous statistics that would be sent
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Statistics data preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 installationId: { type: string }
 *                 version: { type: string }
 *                 platform: { type: string }
 *                 seriesCount: { type: integer }
 *                 volumeCount: { type: integer }
 *                 chapterCount: { type: integer }
 */
// GET - Preview statistics that would be sent (does not send)
export async function GET() {
  try {
    const stats = await collectStatistics();
    return NextResponse.json(stats);
  } catch (error) {
    logger.error('Error collecting statistics', 'StatisticsAPI', error);
    return NextResponse.json(
      { error: 'Failed to collect statistics' },
      { status: 500 }
    );
  }
}

// POST - Manually send statistics (for testing)
export async function POST() {
  try {
    const sent = await sendStatistics();
    return NextResponse.json({ 
      success: sent,
      message: sent ? 'Statistics sent successfully' : 'Failed to send statistics'
    });
  } catch (error) {
    logger.error('Error sending statistics', 'StatisticsAPI', error);
    return NextResponse.json(
      { error: 'Failed to send statistics' },
      { status: 500 }
    );
  }
}
