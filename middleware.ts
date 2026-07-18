import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Lightweight edge middleware for basic stateless routing guards
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Only protect the /admin and /field scopes
  if (pathname.startsWith('/admin') || pathname.startsWith('/field')) {
    
    // Allow access to login pages and manifest APIs
    if (
      pathname === '/admin/login' || 
      pathname === '/field/login' ||
      pathname.includes('manifest.webmanifest') ||
      pathname.startsWith('/api/')
    ) {
      return NextResponse.next();
    }

    // Check for our lightweight custom stateless session cookie
    const sessionCookie = request.cookies.get('daarayn_session')?.value;
    
    if (!sessionCookie) {
      // Missing auth cookie -> gracefully intercept and redirect to correct login portal
      const loginUrl = new URL(
        pathname.startsWith('/admin') ? '/admin/login' : '/field/login', 
        request.url
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Ensure the middleware only executes on the relevant paths
export const config = {
  matcher: ['/admin/:path*', '/field/:path*'],
};
