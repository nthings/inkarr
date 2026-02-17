// Users API - User management

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import logger from '@/app/lib/logger';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   username: { type: string }
 *                   isAdmin: { type: boolean }
 *                   createdAt: { type: string, format: date-time }
 */
// GET - List all users
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
        _count: {
          select: { sessions: true },
        },
      },
      orderBy: { username: 'asc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    logger.error('Error fetching users', 'UsersAPI', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST - Create a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, isAdmin } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        isAdmin: isAdmin ?? false,
      },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error('Error creating user', 'UsersAPI', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
