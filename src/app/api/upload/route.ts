import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { requireSession } from '@/lib/security/session';

/**
 * POST /api/upload
 *
 * Accepts multipart form data with one or more files under the "files" key.
 * Saves each file to `./uploads/<year-month>/` and returns the saved paths.
 *
 * Response: { files: [{ name, path, size }] }
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

export async function POST(request: NextRequest) {
  try {
    await requireSession();

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Файлы не загружены' }, { status: 400 });
    }

    // Date-based subdirectory: uploads/2026-06/
    const now = new Date();
    const subDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadPath = path.resolve(UPLOAD_DIR, subDir);
    await mkdir(uploadPath, { recursive: true });

    const savedFiles: Array<{ name: string; path: string; size: number }> = [];

    for (const file of files) {
      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Недопустимый тип файла: ${file.type}. Разрешены: JPEG, PNG, WebP, GIF, SVG` },
          { status: 400 },
        );
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Файл "${file.name}" слишком большой (макс. 50 МБ)` },
          { status: 400 },
        );
      }

      // Generate safe filename: <random>-<originalname>
      const ext = path.extname(file.name) || '.jpg';
      const safeName = `${randomBytes(8).toString('hex')}${ext}`;
      const filePath = path.join(uploadPath, safeName);

      // Write to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // Return the path relative to project root (automation will use this)
      const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

      savedFiles.push({
        name: file.name,
        path: relativePath,
        size: file.size,
      });
    }

    return NextResponse.json({ files: savedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка загрузки' },
      { status: 500 },
    );
  }
}

/**
 * Configuration for Next.js — disable body parser for multipart
 */
export const config = {
  api: { bodyParser: false },
};
