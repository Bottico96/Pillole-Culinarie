// ── Messaggio errore sotto un campo ──────────────────────────
export function FieldError({ error }) {
  if (!error) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      marginTop: 5, fontSize: 11, color: 'var(--red)',
      background: 'rgba(192,57,43,0.06)',
      border: '1px solid rgba(192,57,43,0.2)',
      borderRadius: 5, padding: '4px 8px'
    }}>
      ⚠ {error}
    </div>
  )
}

// ── Riepilogo errori in cima al modal ────────────────────────
export function ValidationSummary({ errors }) {
  if (!errors || errors.length === 0) return null
  return (
    <div style={{
      background: 'rgba(192,57,43,0.07)',
      border: '1px solid rgba(192,57,43,0.25)',
      borderRadius: 8, padding: '12px 16px', marginBottom: 16
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)', marginBottom: 6 }}>
        ⚠ Correggi i seguenti errori prima di salvare:
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {errors.map((e, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--red)', marginBottom: 3 }}>{e}</li>
        ))}
      </ul>
    </div>
  )
}

// ── Modal di conferma che sostituisce window.confirm ─────────
import { useState } from 'react'

let _resolve = null

export function useConfirm() {
  const [state, setState] = useState({ open: false, msg: '', detail: '' })

  const confirm = (msg, detail = '') => {
    setState({ open: true, msg, detail })
    return new Promise(resolve => { _resolve = resolve })
  }

  const handleYes = () => { setState(s => ({ ...s, open: false })); _resolve?.(true) }
  const handleNo  = () => { setState(s => ({ ...s, open: false })); _resolve?.(false) }

  const ConfirmModal = () => !state.open ? null : (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
        <div className="modal-title" style={{ fontSize: 18 }}>{state.msg}</div>
        {state.detail && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{state.detail}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={handleNo}>Annulla</button>
          <button className="btn btn-danger" onClick={handleYes}>Sì, elimina</button>
        </div>
      </div>
    </div>
  )

  return { confirm, ConfirmModal }
}

// ── Badge vista (Consuntivo / Budget / Totale) ────────────────
export function VistaBadge({ vista }) {
  const config = {
    cons: { label: '✓ Consuntivo', color: 'var(--green)', bg: 'rgba(45,122,58,0.1)', border: 'rgba(45,122,58,0.3)' },
    bdg:  { label: '◎ Budget',     color: 'var(--blue)',  bg: 'rgba(44,95,138,0.1)',  border: 'rgba(44,95,138,0.3)' },
    tot:  { label: '⊕ Totale',     color: 'var(--gold)',  bg: 'rgba(160,120,64,0.1)', border: 'rgba(160,120,64,0.3)' },
  }
  const c = config[vista] || config.tot
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  )
}

// ── Toggle vista (Cons / Bdg) — Totale rimosso ───────────────
export function VistaToggle({ vista, onChange, includeTot = false }) {
  const opts = [
    { key: 'cons', label: '✓ Consuntivo' },
    { key: 'bdg',  label: '◎ Budget' },
    ...(includeTot ? [{ key: 'tot', label: '⊕ Totale' }] : []),
  ]
  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {opts.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          style={{
            padding: '7px 14px', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: vista === o.key ? 600 : 400,
            background: vista === o.key ? 'var(--gold)' : 'transparent',
            color: vista === o.key ? '#fff' : 'var(--text-muted)',
            fontFamily: "'DM Sans', sans-serif", transition: '0.15s'
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}
