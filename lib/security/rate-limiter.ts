import { NextRequest, NextResponse } from "next/server";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory sliding window store (can be backed by Redis in multi-region environments)
const rateLimitMap = new Map<string, RateLimitStore>();

// Clean up expired tokens periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, store] of rateLimitMap.entries()) {
      if (now > store.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 60 * 1000);
}

export interface RateLimitOptions {
  limit?: number; // max allowed requests
  windowMs?: number; // time window in milliseconds
}

/**
 * Check and enforce rate limits for incoming API requests
 */
export function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; reset: number; response?: NextResponse } {
  const limit = options.limit || 60; // 60 requests default
  const windowMs = options.windowMs || 60 * 1000; // 1 minute default

  // Determine client identifier (IP or auth token)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
             req.headers.get("x-real-ip") || 
             "127.0.0.1";
  
  const pathname = req.nextUrl.pathname;
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  const current = rateLimitMap.get(key);

  if (!current || now > current.resetTime) {
    // Initialize new window
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });

    return { allowed: true, remaining: limit - 1, reset: Math.ceil((now + windowMs) / 1000) };
  }

  if (current.count >= limit) {
    // Limit exceeded
    const resetSec = Math.ceil((current.resetTime - now) / 1000);
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: `Too many requests. Please try again in ${resetSec} seconds.`,
        },
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(current.resetTime / 1000)),
          "Retry-After": String(resetSec),
        },
      }
    );

    return { allowed: false, remaining: 0, reset: Math.ceil(current.resetTime / 1000), response };
  }

  current.count += 1;
  rateLimitMap.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    reset: Math.ceil(current.resetTime / 1000),
  };
}
