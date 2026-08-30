import { NextResponse } from "next/server";

export interface ApiResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  timestamp?: string;
  [key: string]: any;
}

export function apiSuccess<T>(data: T, meta?: ApiResponseMeta, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status }
  );
}

export function apiError(
  code: string,
  message: string,
  details: any = null,
  status: number = 400
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}
