import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

/**
 * GET /api/uploads/[...path]
 *
 * Serves uploaded files from the uploads directory.
 * This allows the ImageUploader to show previews of uploaded images.
 */
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await props.params;
    const filePath = path.resolve(UPLOAD_DIR, ...segments);

    // Security: ensure the resolved path is inside the uploads directory
    const resolvedUpload = path.resolve(UPLOAD_DIR);
    if (!filePath.startsWith(resolvedUpload)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    // Determine content type from extension
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };

    const contentType = contentTypes[ext] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
