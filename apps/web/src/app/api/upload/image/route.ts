import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getAuth } from '@/lib/server/auth';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = 'menu-images';

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
    const formData = await req.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return fail('Nenhuma imagem enviada', 400);
    }
    if (!file.type.startsWith('image/')) {
      return fail('Apenas arquivos de imagem são permitidos', 400);
    }
    if (file.size > MAX_BYTES) {
      return fail('Imagem maior que 10MB', 400);
    }

    // Namespacing by store keeps one owner's uploads from colliding with
    // another's, and the random id stops a re-upload from overwriting.
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${auth.userId}/${randomUUID()}.${extension}`;

    // The service role key never reaches the browser: this runs server-side
    // only, and the bucket grants anonymous read but no anonymous write.
    const supabase = createClient(url, serviceKey);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return fail(error.message, 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ imageUrl: publicUrl, fileName: path });
  } catch (error: any) {
    return fromError(error, 'Falha ao enviar imagem');
  }
}
