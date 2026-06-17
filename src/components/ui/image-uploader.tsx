'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X, Loader2, AlertCircle } from 'lucide-react';

type UploadedFile = {
  name: string;
  path: string;
  size: number;
  previewUrl?: string;
};

type ImageUploaderProps = {
  /** Currently saved paths (from DB or form state) */
  value: string[];
  /** Called when the list of paths changes */
  onChange: (paths: string[]) => void;
  /** Maximum number of files (default: 10) */
  maxFiles?: number;
  /** Label to display above the uploader */
  label?: string;
  /** Whether this is a single-file uploader (e.g. for logo) */
  single?: boolean;
};

export function ImageUploader({
  value,
  onChange,
  maxFiles = 10,
  label,
  single = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [dragOver, setDragOver] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveMax = single ? 1 : maxFiles;

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null);
      const files = Array.from(fileList);

      if (files.length === 0) return;

      // Check max files
      const totalAfter = (single ? 0 : value.length) + files.length;
      if (totalAfter > effectiveMax) {
        setError(`Максимум ${effectiveMax} файл(ов). Сейчас уже ${value.length}.`);
        return;
      }

      // Generate local previews immediately
      const newPreviews = new Map(previews);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          newPreviews.set(file.name, url);
        }
      }
      setPreviews(newPreviews);

      // Upload to server
      setUploading(true);
      try {
        const formData = new FormData();
        for (const file of files) {
          formData.append('files', file);
        }

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = (await response.json()) as {
          files?: UploadedFile[];
          error?: string;
        };

        if (!response.ok || data.error) {
          setError(data.error ?? 'Ошибка загрузки');
          return;
        }

        const uploadedPaths = (data.files ?? []).map((f) => f.path);

        if (single) {
          onChange(uploadedPaths.slice(0, 1));
        } else {
          onChange([...value, ...uploadedPaths]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка сети');
      } finally {
        setUploading(false);
      }
    },
    [value, onChange, single, effectiveMax, previews],
  );

  const removeFile = useCallback(
    (index: number) => {
      const next = [...value];
      next.splice(index, 1);
      onChange(next);
    },
    [value, onChange],
  );

  // ── Drag and drop handlers ──

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      if (e.dataTransfer.files.length > 0) {
        void uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void uploadFiles(e.target.files);
        // Reset input so the same file can be selected again
        e.target.value = '';
      }
    },
    [uploadFiles],
  );

  const canAddMore = value.length < effectiveMax && !uploading;

  return (
    <div className="grid gap-2">
      {label && <p className="text-sm font-medium text-ink">{label}</p>}

      {/* Existing files grid */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((filePath, index) => {
            // Try to show preview: if it's a relative path, prefix with /
            const previewSrc = filePath.startsWith('http')
              ? filePath
              : filePath.startsWith('uploads/')
                ? `/api/${filePath}`
                : `/${filePath}`;

            return (
              <div
                key={`${filePath}-${index}`}
                className="group relative h-24 w-24 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 shadow-sm cursor-zoom-in"
                onClick={() => setActiveLightboxImage(previewSrc)}
              >
                {!single && (
                  <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow-md z-10">
                    {index + 1}
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt={`Файл ${index + 1}`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // If image can't load, show filename instead
                    const el = e.currentTarget;
                    el.style.display = 'none';
                    const parent = el.parentElement;
                    if (parent) {
                      const fallback = document.createElement('div');
                      fallback.className =
                        'flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-muted';
                      fallback.textContent = filePath.split('/').pop() ?? 'file';
                      parent.appendChild(fallback);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-20"
                  aria-label="Удалить"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Drop zone */}
      {canAddMore && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleClick();
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? 'border-violet-500 bg-violet-600/10 text-violet-400'
              : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-violet-500 hover:bg-slate-900/80 hover:text-violet-400'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <span className="text-sm">Загрузка...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-8 w-8" />
              <span className="text-sm font-medium">
                {single ? 'Нажмите или перетащите файл' : 'Нажмите или перетащите файлы'}
              </span>
              <span className="text-xs">
                JPG, PNG, WebP, GIF · до 50 МБ
                {!single && ` · макс. ${effectiveMax} шт.`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        multiple={!single}
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div className="relative max-h-[85vh] max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLightboxImage}
              alt="Увеличенное изображение"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              className="absolute -right-10 -top-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={() => setActiveLightboxImage(null)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
