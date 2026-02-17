// Volume API - GET, PUT, DELETE by ID

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { serializeBigInt } from '@/app/lib/utils/serialize';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * @swagger
 * /api/v1/volume/{id}:
 *   get:
 *     summary: Get a volume by ID
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Volume ID
 *     responses:
 *       200:
 *         description: Volume details with chapters and media files
 *       404:
 *         description: Volume not found
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const volumeId = parseInt(id, 10);
    
    if (isNaN(volumeId)) {
      return NextResponse.json(
        { error: 'Invalid volume ID' },
        { status: 400 }
      );
    }

    const volume = await prisma.volume.findUnique({
      where: { id: volumeId },
      include: {
        chapters: true,
        mediaFiles: true,
        series: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!volume) {
      return NextResponse.json(
        { error: 'Volume not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeBigInt(volume));
  } catch (error) {
    console.error('Error fetching volume:', error);
    return NextResponse.json(
      { error: 'Failed to fetch volume' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const volumeId = parseInt(id, 10);
    
    if (isNaN(volumeId)) {
      return NextResponse.json(
        { error: 'Invalid volume ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { monitored, title, volumeNumber, releaseDate, imageUrl } = body;

    const volume = await prisma.volume.update({
      where: { id: volumeId },
      data: {
        ...(monitored !== undefined && { monitored }),
        ...(title !== undefined && { title }),
        ...(volumeNumber !== undefined && { volumeNumber }),
        ...(releaseDate !== undefined && { releaseDate: releaseDate ? new Date(releaseDate) : null }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
    });

    return NextResponse.json(volume);
  } catch (error) {
    console.error('Error updating volume:', error);
    return NextResponse.json(
      { error: 'Failed to update volume' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const volumeId = parseInt(id, 10);
    
    if (isNaN(volumeId)) {
      return NextResponse.json(
        { error: 'Invalid volume ID' },
        { status: 400 }
      );
    }

    await prisma.volume.delete({
      where: { id: volumeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting volume:', error);
    return NextResponse.json(
      { error: 'Failed to delete volume' },
      { status: 500 }
    );
  }
}
