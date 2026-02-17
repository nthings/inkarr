import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/v1/config', // Need to allow config API for initial setup
  '/api/v1/auth',   // Auth API must be public
  '/api/docs',      // OpenAPI spec endpoint
  '/docs',          // Swagger UI page
  '/login',
  '/_next',
  '/favicon.ico',
];

// Check if path matches any public route
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Get auth configuration
  let authMethod = 'none';
  
  try {
    const configUrl = new URL('/api/v1/config', request.url);
    const configResponse = await fetch(configUrl);
    const config = await configResponse.json();
    authMethod = config.AuthenticationMethod || 'none';
  } catch {
    // If we can't check, assume no auth required
  }
  
  // If no authentication is configured, allow all requests
  if (authMethod === 'none') {
    return NextResponse.next();
  }
  
  // Check for API key in header for API routes (external API access)
  if (pathname.startsWith('/api/')) {
    const apiKey = request.headers.get('X-Api-Key');
    const authCookie = request.cookies.get('inkarr-auth');
    
    // Allow if valid API key OR valid session cookie
    if (apiKey) {
      try {
        const configUrl = new URL('/api/v1/config?key=ApiKey', request.url);
        const configResponse = await fetch(configUrl);
        const config = await configResponse.json();
        
        if (config.value === apiKey) {
          return NextResponse.next();
        }
        
        return NextResponse.json(
          { 
            error: 'Invalid API key',
            message: 'The provided X-Api-Key header does not match the configured API key. Check Settings > General for the correct key.',
          },
          { status: 401 }
        );
      } catch {
        // Continue to check cookie
      }
    }
    
    // Check session cookie for browser requests
    if (authCookie) {
      return NextResponse.next();
    }
    
    return NextResponse.json(
      { 
        error: 'Authentication required',
        message: `Authentication is enabled (method: ${authMethod}). For API access, include the X-Api-Key header. For browser access, log in at /login.`,
        authMethod,
      },
      { status: 401 }
    );
  }
  
  // For UI routes, check session cookie
  const authCookie = request.cookies.get('inkarr-auth');
  
  if (!authCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
