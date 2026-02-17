// Chapter API - GET, PUT, DELETE by ID

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { serializeBigInt } from '@/app/lib/utils/serialize';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * @swagger
 * /api/v1/chapter/{id}:
 *   get:
 *     summary: Get a chapter by ID
 *     tags: [Volumes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chapter ID
 *     responses:
 *       200:
 *         description: Chapter details
 *       404:
 *         description: Chapter not found
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const chapterId = parseInt(id, 10);
    
    if (isNaN(chapterId)) {
      return NextResponse.json(
        { error: 'Invalid chapter ID' },
        { status: 400 }
      );
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        mediaFiles: true,
        volume: {
          select: {
            id: true,
            volumeNumber: true,
            title: true,
          },
        },
        series: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeBigInt(chapter));
  } catch (error) {
    console.error('Error fetching chapter:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapter' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const chapterId = parseInt(id, 10);
    
    if (isNaN(chapterId)) {
      return NextResponse.json(
        { error: 'Invalid chapter ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { monitored, title, chapterNumber, issueNumber, releaseDate, imageUrl, volumeId } = body;

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        ...(monitored !== undefined && { monitored }),
        ...(title !== undefined && { title }),
        ...(chapterNumber !== undefined && { chapterNumber }),
        ...(issueNumber !== undefined && { issueNumber }),
        ...(releaseDate !== undefined && { releaseDate: releaseDate ? new Date(releaseDate) : null }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(volumeId !== undefined && { volumeId }),
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Error updating chapter:', error);
    return NextResponse.json(
      { error: 'Failed to update chapter' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const chapterId = parseInt(id, 10);
    
    if (isNaN(chapterId)) {
      return NextResponse.json(
        { error: 'Invalid chapter ID' },
        { status: 400 }
      );
    }

    await prisma.chapter.delete({
      where: { id: chapterId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json(
      { error: 'Failed to delete chapter' },
      { status: 500 }
    );
  }
}
