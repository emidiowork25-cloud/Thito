import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getAuth } from '@/lib/server/auth';
import { clientIp, rateLimit, LIMITS } from '@/lib/server/rate-limit';
import { fail, unauthorized, forbidden, tooManyRequests, fromError } from '@/lib/server/http';

const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = 'menu-images';

/**
 * Formats are identified by their leading bytes, not by the declared
 * Content-Type or the filename — both are chosen by the caller. The
 * extension and stored content type come from whatever the bytes actually
 * are, so a script renamed to .png cannot end up served as one.
 */
const SIGNATURES: Array<{
  mime: string;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    extension: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    extension: 'gif',
    matches: (b) =>
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

function identify(bytes: Uint8Array) {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null;
}

export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return fail('Armazenamento de imagens não configurado', 500);
  }

  try {
    const { allowed, retryAfterSeconds } = await rateLimit(
      `upload:${auth.userId}:${clientIp(req)}`,
      LIMITS.upload.limit,
      LIMITS.upload.windowSeconds
    );
    if (!allowed) return tooManyRequests(retryAfterSeconds);

    const formData = await req.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return fail('Nenhuma imagem enviada', 400);
    }
    // Checked before reading the body into memory.
    if (file.size > MAX_BYTES) {
      return fail('Imagem maior que 5MB', 400);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return fail('Imagem maior que 5MB', 400);
    }

    const format = identify(buffer);
    if (!format) {
      return fail('Envie uma imagem JPEG, PNG, GIF ou WebP', 400);
    }

    // Path is built entirely from values this server controls; nothing from
    // the filename reaches it, so it cannot be steered out of the prefix.
    const path = `${auth.userId}/${randomUUID()}.${format.extension}`;

    // The service role key never reaches the browser: this runs server-side
    // only, and the bucket grants anonymous read but no anonymous write.
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: format.mime,
      upsert: false,
    });

    if (error) {
      console.error('Storage upload failed:', error.message);
      return fail('Falha ao enviar imagem', 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ imageUrl: publicUrl, fileName: path });
  } catch (error: any) {
    return fromError(error, 'Falha ao enviar imagem');
  }
}
