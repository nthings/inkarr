// Series by ID API - GET, PUT, DELETE

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { serializeBigInt } from '@/app/lib/utils/serialize';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * @swagger
 * /api/v1/series/{id}:
 *   get:
 *     summary: Get a series by ID
 *     tags: [Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Series ID
 *       - in: query
 *         name: includeVolumes
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeChapters
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeCreators
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeMediaFiles
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Series details
 *       404:
 *         description: Series not found
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const seriesId = parseInt(id, 10);
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const includeVolumes = searchParams.get('includeVolumes') === 'true';
    const includeChapters = searchParams.get('includeChapters') === 'true';
    const includeCreators = searchParams.get('includeCreators') === 'true';
    const includeMediaFiles = searchParams.get('includeMediaFiles') === 'true';

    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        volumes: includeVolumes ? {
          include: {
            chapters: true,
            mediaFiles: true,
          },
          orderBy: { volumeNumber: 'asc' },
        } : false,
        chapters: includeChapters ? {
          include: {
            mediaFiles: true,
          },
          orderBy: { chapterNumber: 'asc' },
        } : false,
        creators: includeCreators ? {
          include: {
            creator: {
              include: {
                metadata: true,
              },
            },
          },
        } : false,
        mediaFiles: includeMediaFiles,
        qualityProfile: true,
        metadataProfile: true,
        _count: {
          select: {
            volumes: true,
            chapters: true,
            mediaFiles: true,
          },
        },
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeBigInt(series));
  } catch (error) {
    console.error('Error fetching series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch series' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const seriesId = parseInt(id, 10);
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      title,
      sortTitle,
      overview,
      monitored,
      monitorStatus,
      path,
      rootFolderPath,
      qualityProfileId,
      metadataProfileId,
      tags,
    } = body;

    const series = await prisma.series.update({
      where: { id: seriesId },
      data: {
        ...(title !== undefined && { title }),
        ...(sortTitle !== undefined && { sortTitle }),
        ...(overview !== undefined && { overview }),
        ...(monitored !== undefined && { monitored }),
        ...(monitorStatus !== undefined && { monitorStatus }),
        ...(path !== undefined && { path }),
        ...(rootFolderPath !== undefined && { rootFolderPath }),
        ...(qualityProfileId !== undefined && { qualityProfileId }),
        ...(metadataProfileId !== undefined && { metadataProfileId }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      },
      include: {
        qualityProfile: true,
        metadataProfile: true,
      },
    });

    return NextResponse.json(series);
  } catch (error) {
    console.error('Error updating series:', error);
    return NextResponse.json(
      { error: 'Failed to update series' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const seriesId = parseInt(id, 10);
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const deleteFiles = searchParams.get('deleteFiles') === 'true';

    if (deleteFiles) {
      // TODO: Delete actual files from disk
    }

    await prisma.series.delete({
      where: { id: seriesId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting series:', error);
    return NextResponse.json(
      { error: 'Failed to delete series' },
      { status: 500 }
    );
  }
}
