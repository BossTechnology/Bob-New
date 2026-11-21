// The rule-configuration tables of schema `bob`, as bob_app, for the
// /api/config routes in the box. There is no PostgREST in a box (insumos de
// Bzzz §4.2, punto 1), so this speaks the handful of query-builder calls those
// routes already make (select, insert, update, upsert, delete; eq, in,
// contains, order;
// single, maybeSingle) and compiles each one to one SQL statement, run in its
// own bob_app transaction under the box's org claim. RLS applies to every row.
//
// Only the tables and columns named below are reachable: what is off in v1
// (alerts, interactions, autobotz, ...) cannot be reached through here. An
// unknown table or column is an error, not a silent drop.
import type { Pool } from 'pg'
import { asBobApp } from './db.ts'

const COMMON = ['id', 'org_id', 'created_at']
export const TABLES: Record<string, { columns: string[]; jsonb?: string[] }> = {
  threshold_configs: {
    columns: [...COMMON, 'metric_id', 'upper_bound', 'lower_bound', 'peak_mode', 'peak_windows',
      'updated_at', 'scope_kind', 'scope_ref'],
    jsonb: ['peak_windows'],
  },
  anomaly_rules: {
    columns: [...COMMON, 'metric_id', 'rule_type', 'name', 'condition', 'keywords', 'freq_threshold',
      'scope_kind', 'scope_ref'],
  },
  text_rules: {
    columns: [...COMMON, 'metric_id', 'name', 'condition', 'value', 'scope_kind', 'scope_ref'],
  },
  notification_channels: {
    columns: [...COMMON, 'type', 'label', 'values', 'updated_at'],
  },
  response_rules: {
    columns: [...COMMON, 'threshold_id', 'anomaly_rule_id', 'text_rule_id', 'autobotz_id', 'type', 'name',
      'channel_ids', 'subject', 'message'],
  },
}

export type TableError = { message: string; code?: string }
export type TableResult = { data: any; error: TableError | null } // eslint-disable-line @typescript-eslint/no-explicit-any

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete'
type Filter = { col: string; kind: 'eq' | 'in' | 'contains'; value: unknown }

export class TableQuery implements PromiseLike<TableResult> {
  private op: Op = 'select'
  private cols: string[] | null = null
  private returning = false
  private filters: Filter[] = []
  private orderBy: { col: string; asc: boolean } | null = null
  private row: Record<string, unknown> | null = null
  private conflict: string[] = []
  private one: 'single' | 'maybe' | null = null

  private table: string
  private orgId: string
  private source?: Pool
  constructor(table: string, orgId: string, source?: Pool) {
    this.table = table
    this.orgId = orgId
    this.source = source
  }

  select(cols = '*') {
    if (this.op === 'select') this.cols = parseCols(cols)
    else { this.returning = true; this.cols = parseCols(cols) }
    return this
  }
  insert(row: Record<string, unknown>) { this.op = 'insert'; this.row = row; return this }
  update(patch: Record<string, unknown>) { this.op = 'update'; this.row = patch; return this }
  upsert(row: Record<string, unknown>, o: { onConflict?: string } = {}) {
    this.op = 'upsert'; this.row = row
    this.conflict = (o.onConflict ?? 'id').split(',').map((c) => c.trim())
    return this
  }
  delete() { this.op = 'delete'; return this }
  eq(col: string, value: unknown) { this.filters.push({ col, kind: 'eq', value }); return this }
  in(col: string, value: unknown[]) { this.filters.push({ col, kind: 'in', value }); return this }
  contains(col: string, value: unknown[]) { this.filters.push({ col, kind: 'contains', value }); return this }
  order(col: string, o: { ascending?: boolean } = {}) { this.orderBy = { col, asc: o.ascending !== false }; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }

  then<A = TableResult, B = never>(
    ok?: ((v: TableResult) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(ok, ko)
  }

  private async run(): Promise<TableResult> {
    let sql: { text: string; values: unknown[] }
    try {
      sql = this.compile()
    } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: 'BOB_QUERY' } }
    }
    try {
      const rows = await asBobApp(this.orgId, async (db) => (await db.query(sql.text, sql.values)).rows,
        this.source, { write: this.op !== 'select' })
      if (this.one) {
        if (rows.length > 1) return { data: null, error: { message: 'more than one row', code: 'PGRST116' } }
        if (rows.length === 0) {
          return this.one === 'maybe' ? { data: null, error: null }
            : { data: null, error: { message: 'no row', code: 'PGRST116' } }
        }
        return { data: rows[0], error: null }
      }
      return { data: this.op === 'select' || this.returning ? rows : null, error: null }
    } catch (e) {
      const err = e as { message?: string; code?: string }
      return { data: null, error: { message: err.message ?? String(e), code: err.code } }
    }
  }

  compile(): { text: string; values: unknown[] } {
    const spec = TABLES[this.table]
    if (!spec) throw new Error(`table ${this.table} is not reachable in the box`)
    const col = (c: string) => {
      if (!spec.columns.includes(c)) throw new Error(`column ${this.table}.${c} is not reachable`)
      return `"${c}"`
    }
    const values: unknown[] = []
    const param = (c: string, v: unknown) => {
      values.push(spec.jsonb?.includes(c) && v !== null && v !== undefined ? JSON.stringify(v) : v)
      return `$${values.length}`
    }
    const cond = (f: Filter) => f.kind === 'eq' ? `${col(f.col)} = ${param(f.col, f.value)}`
      : f.kind === 'in' ? `${col(f.col)} = ANY(${param(f.col, f.value)})`
        : `${col(f.col)} @> ${param(f.col, f.value)}`
    const where = () => (this.filters.length ? ' WHERE ' + this.filters.map(cond).join(' AND ') : '')
    const list = (cs: string[] | null) => (!cs || cs.includes('*') ? '*' : cs.map(col).join(', '))
    const ret = () => (this.returning ? ` RETURNING ${list(this.cols)}` : '')
    const t = `bob."${this.table}"`

    switch (this.op) {
      case 'select': {
        const order = this.orderBy ? ` ORDER BY ${col(this.orderBy.col)} ${this.orderBy.asc ? 'ASC' : 'DESC'}` : ''
        return { text: `SELECT ${list(this.cols)} FROM ${t}${where()}${order}`, values }
      }
      case 'insert':
      case 'upsert': {
        const keys = Object.keys(this.row ?? {})
        if (!keys.length) throw new Error('nothing to write')
        const cols = keys.map(col).join(', ')
        const vals = keys.map((k) => param(k, this.row![k])).join(', ')
        let text = `INSERT INTO ${t} (${cols}) VALUES (${vals})`
        if (this.op === 'upsert') {
          const target = this.conflict.map(col).join(', ')
          const set = keys.filter((k) => !this.conflict.includes(k)).map((k) => `${col(k)} = EXCLUDED.${col(k)}`)
          text += set.length ? ` ON CONFLICT (${target}) DO UPDATE SET ${set.join(', ')}` : ` ON CONFLICT (${target}) DO NOTHING`
        }
        return { text: text + ret(), values }
      }
      case 'update': {
        const keys = Object.keys(this.row ?? {})
        if (!keys.length) throw new Error('nothing to write')
        const set = keys.map((k) => `${col(k)} = ${param(k, this.row![k])}`).join(', ')
        if (!this.filters.length) throw new Error('an update needs a filter')
        return { text: `UPDATE ${t} SET ${set}${where()}${ret()}`, values }
      }
      case 'delete':
        if (!this.filters.length) throw new Error('a delete needs a filter')
        return { text: `DELETE FROM ${t}${where()}${ret()}`, values }
    }
  }
}

function parseCols(s: string): string[] {
  const cs = s.split(',').map((c) => c.trim()).filter(Boolean)
  for (const c of cs) if (c !== '*' && !/^[a-z_][a-z0-9_]*$/.test(c)) throw new Error(`unsupported select: ${c}`)
  return cs.length ? cs : ['*']
}

export function bobTables(orgId: string, source?: Pool) {
  return { from: (table: string) => new TableQuery(table, orgId, source) }
}
