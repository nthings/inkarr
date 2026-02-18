// Authentication API - Login/logout for forms authentication

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// Simple session token generation
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Simple password hashing (in production, use bcrypt or argon2)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/**
 * @swagger
 * /api/v1/auth:
 *   post:
 *     summary: Login with username and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     isAdmin: { type: boolean }
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Invalid credentials
 */
// POST - Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Get client info
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
      || request.headers.get('x-real-ip') 
      || null;
    const userAgent = request.headers.get('user-agent') || null;
    
    // Create session
    await prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    const response = NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      },
    });
    
    // Set auth cookie
    // Allow disabling secure cookies for HTTP-only deployments (e.g., local network)
    const secureCookies = process.env.SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production';
    response.cookies.set('inkarr-auth', sessionToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/auth:
 *   delete:
 *     summary: Logout and invalidate session
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful
 */
// DELETE - Logout
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('inkarr-auth')?.value;

    if (sessionToken) {
      // Remove session from database
      await prisma.session.delete({
        where: { token: sessionToken },
      }).catch(() => {}); // Ignore if doesn't exist
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('inkarr-auth');
    
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/auth:
 *   get:
 *     summary: Check authentication status
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Authentication status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated: { type: boolean }
 *                 user:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     isAdmin: { type: boolean }
 */
// GET - Check session and get current user
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('inkarr-auth')?.value;

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    // Find session with user
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    if (session.expiresAt < new Date()) {
      // Session expired, clean it up
      await prisma.session.delete({
        where: { token: sessionToken },
      }).catch(() => {});
      
      return NextResponse.json({ authenticated: false, user: null });
    }

    return NextResponse.json({ 
      authenticated: true,
      user: {
        id: session.user.id,
        username: session.user.username,
        isAdmin: session.user.isAdmin,
      },
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
