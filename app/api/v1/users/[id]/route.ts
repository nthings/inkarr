// User API - Individual user management

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import logger from '@/app/lib/logger';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a specific user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User details with sessions
 *       404:
 *         description: User not found
 *   put:
 *     summary: Update a user (username, password, admin status)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               isAdmin: { type: boolean }
 *     responses:
 *       200:
 *         description: User updated
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted
 *       400:
 *         description: Cannot delete only admin
 */
// GET - Get a specific user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
        sessions: {
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            ipAddress: true,
            userAgent: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    logger.error('Error fetching user', 'UsersAPI', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT - Update a user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);
    const body = await request.json();
    const { username, password, isAdmin } = body;

    const updateData: { username?: string; passwordHash?: string; isAdmin?: boolean } = {};
    
    if (username) {
      // Check if username is taken by another user
      const existing = await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 400 }
        );
      }
      updateData.username = username;
    }
    
    if (password) {
      if (password.length < 4) {
        return NextResponse.json(
          { error: 'Password must be at least 4 characters' },
          { status: 400 }
        );
      }
      updateData.passwordHash = hashPassword(password);
    }
    
    if (typeof isAdmin === 'boolean') {
      updateData.isAdmin = isAdmin;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error('Error updating user', 'UsersAPI', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Don't allow deleting the last admin
    if (user.isAdmin) {
      const adminCount = await prisma.user.count({
        where: { isAdmin: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last admin user' },
          { status: 400 }
        );
      }
    }

    // Delete user (sessions will be cascade deleted)
    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting user', 'UsersAPI', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
