import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { updateMenuItemSchema } from '@/lib/server/validation';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

const ITEM_COLUMNS = `id, name, description, ingredients, price,
  category, image_url AS "imageUrl", is_available AS "isAvailable"`;

type Params = { params: { itemId: string } };

/** Resolves the item only if the caller's store owns it. */
async function assertOwnership(itemId: string, userId: string) {
  const result = await getPool().query(
    `SELECT mi.id FROM menu_items mi
     JOIN stores s ON mi.store_id = s.id
     WHERE mi.id = $1 AND s.user_id = $2`,
    [itemId, userId]
  );
  return result.rows.length > 0;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const result = await getPool().query(
      `SELECT ${ITEM_COLUMNS} FROM menu_items WHERE id = $1`,
      [params.itemId]
    );

    if (result.rows.length === 0) return fail('Item não encontrado', 404);
    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar item');
  }
}

export async function PUT(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  try {
    const parsed = updateMenuItemSchema.parse(await req.json());

    if (!(await assertOwnership(params.itemId, auth.userId))) {
      return fail('Item não encontrado', 404);
    }

    // Only the keys actually present in the payload get written, so a partial
    // update never blanks out a field the caller left alone.
    const columns: Record<string, unknown> = {
      name: parsed.name,
      description: parsed.description,
      ingredients: parsed.ingredients,
      price: parsed.price,
      category: parsed.category,
      image_url: parsed.imageUrl,
      is_available: parsed.isAvailable,
    };

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [column, value] of Object.entries(columns)) {
      if (value !== undefined) {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      return fail('Nenhum campo para atualizar', 400);
    }

    values.push(params.itemId);

    const result = await getPool().query(
      `UPDATE menu_items SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING ${ITEM_COLUMNS}`,
      values
    );

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return fromError(error, 'Falha ao atualizar item');
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  try {
    if (!(await assertOwnership(params.itemId, auth.userId))) {
      return fail('Item não encontrado', 404);
    }

    await getPool().query('DELETE FROM menu_items WHERE id = $1', [params.itemId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return fromError(error, 'Falha ao deletar item');
  }
}
