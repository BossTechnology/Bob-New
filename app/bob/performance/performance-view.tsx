// What /bob/performance paints, for a viewer (the client's words) or for
// admin and analyst (tables, capabilities, the presence of each projection).
// Painting only: the figures come from buildMatrix, the same for both.
import { ScreenNav, ScreenHeader, SliceThreeNote, StatePaint, ChannelPicker, windowQs, cellTitles } from '../screen-parts'
import { stateTitle } from '@/lib/bob/cell-state.ts'
import { CLIENT_TEXT, noDataFor, type Audience } from '@/lib/bob/audience.ts'
import {
  ACTOR_LABEL, buildMatrix,
  type ActorType, type Cell, type Channel, type MatrixRow,
} from '@/lib/bob/matrix.ts'
import { PROJECTIONS, type PerformanceRead } from '@/lib/bob/projection-reader.ts'
import styles from './matrix.module.css'

export function PerformanceView({ read, channel, audience }: {
  read: PerformanceRead; channel?: string; audience: Audience
}) {
  const matrix = buildMatrix(read.counts, read.responseTimes, read.selected, read.cells)
  const { from, to } = read.window
  const client = audience === 'client'
  const selected = read.selected.length
  const row = (r: MatrixRow) => <Row key={r.spec.id} row={r} actors={matrix.actors} audience={audience} selected={selected} />

  return (
    <main className={styles.page}>
      <ScreenNav current="performance" />
      <ScreenHeader title="RENDIMIENTO" audience={audience} from={from} to={to}
        orgId={read.orgId} watermark={read.watermark} />
      <ChannelPicker channels={read.channels} current={channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Stats" />
        {matrix.rows.map(row)}
      </div>

      <div className={styles.sectionLabel}>{client ? CLIENT_TEXT.unlabeledTurns : 'Turnos sin etiqueta · proj_metric_counts'}</div>
      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Fallas" />
        {matrix.labelFailures.map(row)}
      </div>

      <Legend audience={audience} />
      <SliceThreeNote present={read.cells !== null} audience={audience} />

      {client ? null : <>
        <div className={styles.sectionLabel}>Canales seleccionados</div>
        <ChannelTable channels={read.selected} />

        <div className={styles.sectionLabel}>Las ocho proyecciones · filas en la ventana</div>
        <PresenceTable read={read} />
      </>}
    </main>
  )
}

function Head({ actors, title }: { actors: ActorType[]; title: string }) {
  return (
    <div className={styles.mRow + ' ' + styles.head}>
      <div className={styles.metricHeader}>{title}</div>
      <div className={styles.mTotal}>Total</div>
      {actors.map((a) => <div key={a} className={styles.actorHead}>{ACTOR_LABEL[a]}</div>)}
    </div>
  )
}

function Row({ row, actors, audience, selected }: {
  row: MatrixRow; actors: ActorType[]; audience: Audience; selected: number
}) {
  const isTime = row.spec.table === 'proj_durations'
  if (row.spec.table === null && !row.total.state) {
    // A demo row no projection carries: there is no row to be absent.
    const none = audience === 'client'
      ? <span className={styles.noRow}>{CLIENT_TEXT.noFigure}</span>
      : <span className={styles.noRow} title="ninguna de las ocho tablas lo lleva">sin proyección</span>
    return (
      <div className={styles.mRow}>
        <div className={styles.mName}>{row.spec.label}<Source row={row} audience={audience} selected={selected} /></div>
        <div className={styles.mTotal}>{none}</div>
        {actors.map((a) => <div key={a} className={styles.mPct}>{none}</div>)}
      </div>
    )
  }
  return (
    <div className={styles.mRow}>
      <div className={styles.mName}>
        {row.spec.label}
        <Source row={row} audience={audience} selected={selected} />
      </div>
      <div className={styles.mTotal}><CellView cell={row.total} unit={isTime ? ' resp.' : ''} audience={audience} /></div>
      {actors.map((a) => (
        <div key={a} className={styles.mPct + (a === 'asa' ? ' ' + styles.ai : '')}>
          <CellView cell={row.cells[a]} time={isTime} pct={!isTime} audience={audience} />
        </div>
      ))}
    </div>
  )
}

// Where the row comes from. A viewer sees only "no data" when no selected
// channel declares what the row needs.
function Source({ row, audience, selected }: { row: MatrixRow; audience: Audience; selected: number }) {
  const s = row.spec.source
  if (audience === 'client') {
    const missing = (s.kind === 'capability' || s.kind === 'declaration') && (row.declaredBy ?? []).length === 0
    return missing ? <span className={styles.source + ' ' + styles.notConfigured}>{noDataFor(selected)}</span> : null
  }
  let text: string
  let notConfigured = false
  if (s.kind === 'not_projection') text = s.note
  else if (s.kind === 'unnamed') text = `${row.spec.table}.${row.spec.metric} · el contrato no nombra capacidad`
  else {
    const what = s.kind === 'capability' ? `capacidad ${s.capability}` : 'idle_bound_seconds'
    const by = row.declaredBy ?? []
    notConfigured = by.length === 0
    text = notConfigured ? `${what}: no configurado en la selección` : `${what}: ${by.join(', ')}`
  }
  return (
    <span className={styles.source + (notConfigured ? ' ' + styles.notConfigured : '')}>
      {text}{row.spec.note ? ` · ${row.spec.note}` : ''}
    </span>
  )
}

function CellView({ cell, time = false, pct = false, unit = '', audience }: {
  cell: Cell; time?: boolean; pct?: boolean; unit?: string; audience: Audience
}) {
  const t = cellTitles(audience)
  const client = audience === 'client'
  const st = cell.state
  if (st && st.state !== 'observed') return <StatePaint info={st} audience={audience} />
  // Observed with no row: a declared-absent actor, a zero by declaration (F-32).
  if (st && cell.kind === 'no_row') {
    return <span className={styles.zero} title={client ? undefined : stateTitle(st)}>{st.value ?? 0}{unit}</span>
  }
  if (cell.kind === 'no_row') return <span className={styles.noRow} title={t.noRow}>{t.noRowText}</span>
  const open = cell.open > 0 ? <sup title={t.open(cell.open, cell.rows)}>*</sup> : null
  if (cell.kind === 'zero') {
    return <span className={styles.zero} title={client ? undefined : `${cell.rows} filas, todas en cero`}>0{unit}{open}</span>
  }
  const v = time ? `${(cell.value / 1000).toFixed(1)} s` : `${cell.value}${unit}`
  return (
    <span title={t.rows(cell.rows)}>
      {v}{open}
      {pct && cell.pct !== null ? <span className={styles.share}> {Math.round(cell.pct * 100)}%</span> : null}
    </span>
  )
}

function Legend({ audience }: { audience: Audience }) {
  if (audience === 'client') {
    return (
      <p className={styles.legend}>
        <span className={styles.noRow}>{CLIENT_TEXT.noData}</span>: no hubo actividad registrada en el periodo ·{' '}
        <span className={styles.noRow}>{CLIENT_TEXT.noFigure}</span>: BOb todavía no mide esta cifra ·{' '}
        <span className={styles.zero}>0</span>: hubo actividad y suma cero · <sup>*</sup> cifra provisional ·
        % = parte del total de la fila
      </p>
    )
  }
  return (
    <p className={styles.legend}>
      <span className={styles.noRow}>sin fila</span>: ninguna fila de proyección en la ventana ·{' '}
      <span className={styles.noRow}>sin proyección</span>: la fila de la demo no tiene tabla detrás ·{' '}
      <span className={styles.zero}>0</span>: hay filas y suman cero ·{' '}
      <span className={styles.notConfigured}>no configurado</span>: ningún canal de la selección declara lo que
      la fila necesita · <sup>*</sup> incluye buckets sin sellar · % = parte del total de la fila
    </p>
  )
}

function ChannelTable({ channels }: { channels: Channel[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Canal</th><th>Tipo</th><th>lag_seconds</th><th>idle_bound_seconds</th><th>Capacidades</th></tr>
      </thead>
      <tbody>
        {channels.map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{c.type}</td>
            <td>{c.lag_seconds === null ? <span className={styles.notConfigured}>lag no declarado</span> : c.lag_seconds}</td>
            <td>{c.idle_bound_seconds === null ? <span className={styles.notConfigured}>sin declarar</span> : c.idle_bound_seconds}</td>
            <td>{c.capabilities.length ? c.capabilities.join(', ') : <span className={styles.notConfigured}>ninguna</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PresenceTable({ read }: { read: PerformanceRead }) {
  const cols: (Channel | null)[] = [...read.selected]
  if (read.presence.some((p) => p.channel_id === null)) cols.push(null)
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Proyección</th>
          {cols.map((c) => <th key={c?.id ?? 'null'}>{c ? c.name : 'sin canal'}</th>)}
        </tr>
      </thead>
      <tbody>
        {PROJECTIONS.map((t) => (
          <tr key={t}>
            <td><code>{t}</code></td>
            {cols.map((c) => {
              const p = read.presence.find((x) => x.table === t && x.channel_id === (c?.id ?? null))
              return (
                <td key={c?.id ?? 'null'}>
                  {p ? <>{p.rows}{p.open ? <sup title={`${p.open} sin sellar`}>*</sup> : null}</>
                    : <span className={styles.noRow}>sin fila</span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
