import { query } from '@/lib/postgres/pool';
import { isNoRowsError, toPgError, type PgError } from '@/lib/postgres/errors';

export type QueryResult<T = any> = { data: T | null; error: PgError | null; count?: number | null };

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in' | 'not';

interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
  negate?: boolean;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

interface EmbedSpec {
  alias?: string;
  table: string;
  fk?: string;
  columns: string[];
  nested?: EmbedSpec;
}

interface ParsedSelect {
  columns: string[];
  embeds: EmbedSpec[];
  countOnly: boolean;
}

const TABLE_FKS: Record<string, Record<string, { table: string; localKey: string; foreignKey: string }>> = {
  records: {
    record_days: { table: 'record_days', localKey: 'record_day_id', foreignKey: 'id' },
    record_tags: { table: 'record_tags', localKey: 'id', foreignKey: 'record_id' },
    items: { table: 'items', localKey: 'item_id', foreignKey: 'id' },
    goals: { table: 'goals', localKey: 'goal_id', foreignKey: 'id' },
    finance_accounts: { table: 'finance_accounts', localKey: 'finance_account_id', foreignKey: 'id' },
    finance_account: { table: 'finance_accounts', localKey: 'finance_account_id', foreignKey: 'id' },
    transfer_to: { table: 'finance_accounts', localKey: 'transfer_to_account_id', foreignKey: 'id' },
  },
  record_tags: {
    tags: { table: 'tags', localKey: 'tag_id', foreignKey: 'id' },
  },
  record_days: {
    records: { table: 'records', localKey: 'id', foreignKey: 'record_day_id' },
  },
  items: {
    phases: { table: 'phases', localKey: 'id', foreignKey: 'item_id' },
    records: { table: 'records', localKey: 'id', foreignKey: 'item_id' },
  },
  recurring_activities: {
    items: { table: 'items', localKey: 'item_id', foreignKey: 'id' },
  },
};

/** Split on commas that are not inside parentheses. */
function splitTopLevelComma(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unescapePostgrestValue(value: string): unknown {
  const v = value.replace(/\\,/g, ',').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v;
}

function parsePostgrestFilter(filter: string, params: unknown[], paramIndex: { i: number }): string {
  const trimmed = filter.trim();
  if (!trimmed) return 'TRUE';

  if (trimmed.startsWith('and(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(4, -1);
    const parts = splitTopLevelComma(inner);
    const sub = parts.map((p) => parsePostgrestFilter(p, params, paramIndex));
    return `(${sub.join(' AND ')})`;
  }

  const inMatch = trimmed.match(/^([a-zA-Z_][\w]*)\.in\.\(([\s\S]*)\)$/);
  if (inMatch) {
    const col = quoteIdent(inMatch[1]);
    const vals = splitTopLevelComma(inMatch[2]).map((v) => unescapePostgrestValue(v.trim()));
    if (vals.length === 0) return 'FALSE';
    const placeholders = vals.map(() => `$${paramIndex.i++}`).join(', ');
    params.push(...vals);
    return `${col} IN (${placeholders})`;
  }

  if (/^[a-zA-Z_][\w]*\.is\.null$/.test(trimmed)) {
    const col = trimmed.split('.')[0];
    return `${quoteIdent(col)} IS NULL`;
  }
  if (/^[a-zA-Z_][\w]*\.is\.true$/.test(trimmed)) {
    const col = trimmed.split('.')[0];
    return `${quoteIdent(col)} IS TRUE`;
  }
  if (/^[a-zA-Z_][\w]*\.is\.false$/.test(trimmed)) {
    const col = trimmed.split('.')[0];
    return `${quoteIdent(col)} IS FALSE`;
  }

  const opMatch = trimmed.match(/^([a-zA-Z_][\w]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|cs|cd)\.([\s\S]*)$/);
  if (opMatch) {
    const [, col, op, rawVal] = opMatch;
    const val = unescapePostgrestValue(rawVal);
    const idx = paramIndex.i++;
    params.push(val);
    const c = quoteIdent(col);
    switch (op) {
      case 'eq':
        return `${c} = $${idx}`;
      case 'neq':
        return `${c} <> $${idx}`;
      case 'gt':
        return `${c} > $${idx}`;
      case 'gte':
        return `${c} >= $${idx}`;
      case 'lt':
        return `${c} < $${idx}`;
      case 'lte':
        return `${c} <= $${idx}`;
      case 'like':
        return `${c} LIKE $${idx}`;
      case 'ilike':
        return `${c} ILIKE $${idx}`;
      default:
        return `${c} = $${idx}`;
    }
  }

  throw new Error(`Unsupported PostgREST filter: ${trimmed}`);
}

function parsePostgrestOr(orClause: string, startParamIndex: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const paramIndex = { i: startParamIndex };
  const parts = splitTopLevelComma(orClause);
  const sqlParts = parts.map((p) => parsePostgrestFilter(p, params, paramIndex));
  return { sql: `(${sqlParts.join(' OR ')})`, params };
}

function parseEmbedColumns(raw: string): string[] {
  const inner = raw.trim();
  if (inner === 'count') return ['count'];
  if (inner === '*') return ['*'];
  return splitTopLevelComma(inner).map((c) => c.trim()).filter(Boolean);
}

function parseEmbedToken(token: string): EmbedSpec | null {
  const trimmed = token.trim();
  const openIdx = trimmed.indexOf('(');
  if (openIdx < 0) return null;
  const closeIdx = trimmed.lastIndexOf(')');
  if (closeIdx < openIdx) return null;

  const head = trimmed.slice(0, openIdx).trim();
  const inner = trimmed.slice(openIdx + 1, closeIdx).trim();

  const aliasMatch = head.match(/^([a-zA-Z_][\w]*):([a-zA-Z_][\w]*)(?:!([a-zA-Z_][\w]*))?$/);
  if (aliasMatch) {
    const [, alias, table, fk] = aliasMatch;
    return { alias, table, fk, columns: parseEmbedColumns(inner) };
  }

  const nestedOpen = inner.indexOf('(');
  if (nestedOpen > 0 && inner.endsWith(')')) {
    const nestedTable = inner.slice(0, nestedOpen).trim();
    const nestedInner = inner.slice(nestedOpen + 1, -1);
    return {
      table: head,
      columns: ['*'],
      nested: { table: nestedTable, columns: parseEmbedColumns(nestedInner) },
    };
  }

  return { table: head, columns: parseEmbedColumns(inner) };
}

function parseSelect(select: string): ParsedSelect {
  const normalized = select.replace(/\s+/g, ' ').trim();
  if (normalized === 'count') {
    return { columns: [], embeds: [], countOnly: true };
  }

  const parts = splitTopLevelComma(normalized);
  const columns: string[] = [];
  const embeds: EmbedSpec[] = [];

  for (const part of parts) {
    const embed = parseEmbedToken(part);
    if (embed) embeds.push(embed);
    else if (part !== '*') columns.push(part);
    else columns.push('*');
  }

  if (columns.length === 0 && embeds.length > 0) {
    columns.push('*');
  }

  return { columns, embeds, countOnly: false };
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function buildWhere(filters: Filter[], startIndex = 1): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  for (const f of filters) {
    const col = quoteIdent(f.column);
    const idx = startIndex + params.length;

    switch (f.op) {
      case 'eq':
        params.push(f.value);
        clauses.push(`${col} = $${idx}`);
        break;
      case 'neq':
        params.push(f.value);
        clauses.push(`${col} <> $${idx}`);
        break;
      case 'gt':
        params.push(f.value);
        clauses.push(`${col} > $${idx}`);
        break;
      case 'gte':
        params.push(f.value);
        clauses.push(`${col} >= $${idx}`);
        break;
      case 'lt':
        params.push(f.value);
        clauses.push(`${col} < $${idx}`);
        break;
      case 'lte':
        params.push(f.value);
        clauses.push(`${col} <= $${idx}`);
        break;
      case 'like':
        params.push(f.value);
        clauses.push(`${col} LIKE $${idx}`);
        break;
      case 'ilike':
        params.push(f.value);
        clauses.push(`${col} ILIKE $${idx}`);
        break;
      case 'is':
        if (f.value === null) clauses.push(`${col} IS NULL`);
        else {
          params.push(f.value);
          clauses.push(`${col} IS $${idx}`);
        }
        break;
      case 'in': {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        if (vals.length === 0) {
          clauses.push('FALSE');
        } else {
          const placeholders = vals.map((_, i) => `$${idx + i}`).join(', ');
          params.push(...vals);
          clauses.push(`${col} IN (${placeholders})`);
        }
        break;
      }
      case 'not': {
        const inner = f.value as { op: string; value: unknown };
        if (inner?.op === 'is' && inner.value === null) {
          clauses.push(`${col} IS NOT NULL`);
        } else if (inner?.op === 'eq') {
          params.push(inner.value);
          clauses.push(`${col} <> $${idx}`);
        } else {
          params.push(f.value);
          clauses.push(`NOT (${col} = $${idx})`);
        }
        break;
      }
      default:
        break;
    }

    if (f.negate) {
      const last = clauses.pop();
      if (last) clauses.push(`NOT (${last})`);
    }
  }

  return { clause: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

async function attachEmbeds(
  table: string,
  rows: Record<string, unknown>[],
  embeds: EmbedSpec[]
): Promise<void> {
  if (!rows.length || !embeds.length) return;

  for (const embed of embeds) {
    const key = embed.alias ?? embed.table;
    const mapping = TABLE_FKS[table]?.[key] ?? TABLE_FKS[table]?.[embed.table];

    if (embed.columns.length === 1 && embed.columns[0] === 'count') {
      const rel = mapping ?? { table: embed.table, localKey: 'id', foreignKey: `${table.slice(0, -1)}_id` };
      const ids = [...new Set(rows.map((r) => r[rel.localKey === 'id' ? 'id' : rel.localKey]).filter(Boolean))];
      if (!ids.length) {
        for (const row of rows) row[key] = [{ count: 0 }];
        continue;
      }
      const countCol = rel.foreignKey;
      const { rows: counts } = await query<{ id: string; count: string }>(
        `SELECT ${quoteIdent(countCol)} AS id, COUNT(*)::text AS count
         FROM ${quoteIdent(rel.table)}
         WHERE ${quoteIdent(countCol)} = ANY($1::uuid[])
         GROUP BY ${quoteIdent(countCol)}`,
        [ids]
      );
      const map = new Map(counts.map((c) => [c.id, Number(c.count)]));
      for (const row of rows) {
        const id = row[rel.localKey === 'id' ? 'id' : rel.localKey] as string;
        row[key] = [{ count: map.get(id) ?? 0 }];
      }
      continue;
    }

    if (!mapping) continue;

    const localValues = [...new Set(rows.map((r) => r[mapping.localKey]).filter(Boolean))] as string[];
    if (!localValues.length) continue;

    const cols =
      embed.columns[0] === '*'
        ? '*'
        : embed.columns.map((c) => quoteIdent(c)).join(', ');

    if (mapping.localKey === 'id') {
      const { rows: related } = await query<Record<string, unknown>>(
        `SELECT ${cols} FROM ${quoteIdent(mapping.table)}
         WHERE ${quoteIdent(mapping.foreignKey)} = ANY($1::uuid[])`,
        [localValues]
      );
      const byFk = new Map<string, Record<string, unknown>[]>();
      for (const rel of related) {
        const fk = rel[mapping.foreignKey] as string;
        if (!byFk.has(fk)) byFk.set(fk, []);
        byFk.get(fk)!.push(rel);
      }
      for (const row of rows) {
        row[key] = byFk.get(row.id as string) ?? [];
      }
    } else {
      const { rows: related } = await query<Record<string, unknown>>(
        `SELECT ${cols} FROM ${quoteIdent(mapping.table)}
         WHERE ${quoteIdent(mapping.foreignKey)} = ANY($1::uuid[])`,
        [localValues]
      );
      const byId = new Map(related.map((r) => [r[mapping.foreignKey] as string, r]));
      for (const row of rows) {
        const fkVal = row[mapping.localKey] as string | null;
        row[key] = fkVal ? byId.get(fkVal) ?? null : null;
      }
    }

    if (embed.nested?.table === 'tags' && mapping.table === 'record_tags') {
      const allRt = rows.flatMap((row) => (row[key] as Record<string, unknown>[]) ?? []);
      const tagIds = [...new Set(allRt.map((rt) => rt.tag_id).filter(Boolean))] as string[];
      if (tagIds.length) {
        const { rows: tags } = await query(`SELECT * FROM tags WHERE id = ANY($1::uuid[])`, [tagIds]);
        const tagMap = new Map(tags.map((t) => [t.id as string, t]));
        for (const row of rows) {
          const rtList = (row[key] as Record<string, unknown>[]) ?? [];
          for (const rt of rtList) {
            rt.tags = tagMap.get(rt.tag_id as string) ?? null;
          }
        }
      }
    }
  }
}

export class TableQuery {
  private table: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectStr = '*';
  private selectOptions: { count?: 'exact'; head?: boolean } = {};
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitVal?: number;
  private rangeVal?: { from: number; to: number };
  private insertData: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updateData: Record<string, unknown> | null = null;
  private upsertConflict?: string;
  private orClauses: string[] = [];

  constructor(table: string) {
    this.table = table;
  }

  private returning = false;

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    if (
      this.operation === 'insert' ||
      this.operation === 'upsert' ||
      this.operation === 'update' ||
      this.operation === 'delete'
    ) {
      this.returning = true;
      this.selectStr = columns;
      return this;
    }
    this.operation = 'select';
    this.selectStr = columns;
    this.selectOptions = options ?? {};
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
    this.operation = 'upsert';
    this.insertData = data;
    this.upsertConflict = options?.onConflict;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, op: 'gt', value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, op: 'lt', value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }

  like(column: string, value: unknown) {
    this.filters.push({ column, op: 'like', value });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ column, op: 'ilike', value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ column, op: 'is', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, op: 'in', value: values });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push({ column, op: 'not', value: { op, value } });
    return this;
  }

  or(clause: string) {
    this.orClauses.push(clause);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  range(from: number, to: number) {
    this.rangeVal = { from, to };
    return this;
  }

  private async executeSelect(single: 'none' | 'single' | 'maybeSingle'): Promise<QueryResult<unknown>> {
    try {
      const parsed = parseSelect(this.selectStr);
      const { clause, params } = buildWhere(this.filters);
      let sql = '';
      const extraParams = [...params];

      if (this.selectOptions.count === 'exact' && this.selectOptions.head) {
        sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(this.table)}${clause}`;
        const { rows } = await query<{ count: number }>(sql, extraParams);
        return { data: null, error: null, count: rows[0]?.count ?? 0 };
      }

      const baseCols =
        parsed.columns[0] === '*'
          ? `${quoteIdent(this.table)}.*`
          : parsed.columns.map((c) => `${quoteIdent(this.table)}.${quoteIdent(c)}`).join(', ');

      sql = `SELECT ${baseCols} FROM ${quoteIdent(this.table)}${clause}`;

      for (const orClause of this.orClauses) {
        const { sql: orSql, params: orParams } = parsePostgrestOr(orClause, extraParams.length + 1);
        sql += ` AND ${orSql}`;
        extraParams.push(...orParams);
      }

      if (this.orders.length) {
        const orderSql = this.orders
          .map((o) => {
            const dir = o.ascending ? 'ASC' : 'DESC';
            const nulls =
              o.nullsFirst === true ? 'NULLS FIRST' : o.nullsFirst === false ? 'NULLS LAST' : '';
            return `${quoteIdent(o.column)} ${dir} ${nulls}`.trim();
          })
          .join(', ');
        sql += ` ORDER BY ${orderSql}`;
      }

      if (this.rangeVal) {
        sql += ` LIMIT ${this.rangeVal.to - this.rangeVal.from + 1} OFFSET ${this.rangeVal.from}`;
      } else if (this.limitVal !== undefined) {
        sql += ` LIMIT ${this.limitVal}`;
      }

      if (single === 'single' || single === 'maybeSingle') {
        sql += ' LIMIT 2';
      }

      const { rows } = await query<Record<string, unknown>>(sql, extraParams);

      if (single === 'single' && rows.length !== 1) {
        return { data: null, error: { message: rows.length === 0 ? '0 rows' : 'multiple rows' } };
      }
      if (single === 'maybeSingle' && rows.length > 1) {
        return { data: null, error: { message: 'multiple rows' } };
      }

      await attachEmbeds(this.table, rows, parsed.embeds);

      if (this.selectOptions.count === 'exact') {
        const countSql = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(this.table)}${clause}`;
        const { rows: countRows } = await query<{ count: number }>(countSql, extraParams);
        if (single !== 'none') {
          return { data: rows[0] ?? null, error: null, count: countRows[0]?.count ?? 0 };
        }
        return { data: rows, error: null, count: countRows[0]?.count ?? 0 };
      }

      if (single !== 'none') {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: toPgError(err) };
    }
  }

  private async executeWrite(returning: boolean): Promise<QueryResult<unknown>> {
    try {
      const rows = Array.isArray(this.insertData)
        ? this.insertData
        : this.insertData
          ? [this.insertData]
          : this.updateData
            ? [this.updateData]
            : [];

      if (this.operation === 'delete') {
        const { clause, params } = buildWhere(this.filters);
        let sql = `DELETE FROM ${quoteIdent(this.table)}${clause}`;
        let extraParams = [...params];
        for (const orClause of this.orClauses) {
          const { sql: orSql, params: orParams } = parsePostgrestOr(orClause, extraParams.length + 1);
          const hasWhere = Boolean(clause) || extraParams.length > params.length;
          sql += hasWhere ? ` AND ${orSql}` : ` WHERE ${orSql}`;
          extraParams.push(...orParams);
        }
        if (returning) sql += ' RETURNING *';
        const { rows: result } = await query(sql, extraParams);
        return {
          data: returning ? (result.length === 1 ? result[0] : result) : null,
          error: null,
        };
      }

      if (this.operation === 'update' && this.updateData) {
        const keys = Object.keys(this.updateData);
        const setParts = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`);
        const setParams = keys.map((k) => this.updateData![k]);
        const { clause, params: whereParams } = buildWhere(this.filters, keys.length + 1);
        let sql = `UPDATE ${quoteIdent(this.table)} SET ${setParts.join(', ')}${clause}`;
        let extraParams = [...setParams, ...whereParams];
        for (const orClause of this.orClauses) {
          const { sql: orSql, params: orParams } = parsePostgrestOr(orClause, extraParams.length + 1);
          sql += ` AND ${orSql}`;
          extraParams.push(...orParams);
        }
        if (returning) sql += ' RETURNING *';
        const { rows: result } = await query(sql, extraParams);
        return { data: returning ? (result.length === 1 ? result[0] : result) : null, error: null };
      }

      if ((this.operation === 'insert' || this.operation === 'upsert') && rows.length) {
        const first = rows[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        const valuesSql = rows
          .map((row, ri) => {
            const placeholders = keys.map((_, ci) => `$${ri * keys.length + ci + 1}`).join(', ');
            return `(${placeholders})`;
          })
          .join(', ');
        const flatParams = rows.flatMap((row) => keys.map((k) => (row as Record<string, unknown>)[k]));

        let sql = `INSERT INTO ${quoteIdent(this.table)} (${keys.map(quoteIdent).join(', ')}) VALUES ${valuesSql}`;

        if (this.operation === 'upsert' && this.upsertConflict) {
          const conflictCols = this.upsertConflict.split(',').map((c) => quoteIdent(c.trim())).join(', ');
          const updates = keys
            .filter((k) => k !== this.upsertConflict)
            .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
            .join(', ');
          sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updates}`;
        }

        if (returning) sql += ' RETURNING *';
        const { rows: result } = await query(sql, flatParams);
        return { data: returning ? (result.length === 1 ? result[0] : result) : null, error: null };
      }

      return { data: null, error: { message: 'No data for write operation' } };
    } catch (err) {
      return { data: null, error: toPgError(err) };
    }
  }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (this.operation !== 'select') {
      return this.executeWrite(this.returning).then(onfulfilled, onrejected);
    }
    return this.executeSelect('none').then(onfulfilled, onrejected);
  }

  single(): Promise<QueryResult<any>> {
    if (this.operation !== 'select') {
      return this.executeWrite(this.returning || true);
    }
    return this.executeSelect('single');
  }

  maybeSingle(): Promise<QueryResult<any>> {
    if (this.operation !== 'select') {
      return this.executeWrite(this.returning || true);
    }
    return this.executeSelect('maybeSingle');
  }
}

export async function callRpc(
  functionName: string,
  params: Record<string, unknown>
): Promise<QueryResult<unknown>> {
  try {
    const keys = Object.keys(params);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `SELECT ${quoteIdent(functionName)}(${placeholders}) AS result`;
    const { rows } = await query<{ result: unknown }>(sql, keys.map((k) => params[k]));
    const data = rows[0]?.result ?? null;
    return { data, error: null };
  } catch (err) {
    const pgErr = toPgError(err);
    return { data: null, error: pgErr };
  }
}

export { isNoRowsError };
