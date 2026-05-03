import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import {
  fmt, MESI, fatturatoCliente, totaleProfMese, totaleCostiFissiMese, saldoIvaTrimestre,
  fatturatoFiltrato, costoOperatoreFiltrato, costoFissoFiltrato, compensiFissiMese
} from '../../lib/calc'
import { VistaToggle } from '../ui/FormComponents'

export default function Dashboard() {
  const { progetti, professionisti, costiFissi, businessUnit, loading } = useData()
  const [anno, setAnno] = useState(2026)
  const [vista, setVista] = useState('tot') // 'cons' | 'bdg' | 'tot'

  const stats = useMemo(() => {
    let totF = 0, totCOp = 0, totCF = 0
    const byCliente = {}, byProf = {}, byMese = Array(12).fill(0)

    progetti.forEach(p => {
      for (let m = 1; m <= 12; m++) {
        const f = fatturatoFiltrato(p, anno, m, vista)
        totF += f; byMese[m - 1] += f
        if (f > 0) byCliente[p.cliente] = (byCliente[p.cliente] || 0) + f
      }
    })
    professionisti.forEach(prof => {
      let t = 0
      for (let m = 1; m <= 12; m++) {
        progetti.forEach(p => {
          (p.costi||[]).forEach(c => {
            if (String(c.profId) === String(prof.id)) t += costoOperatoreFiltrato(c, p, anno, m, vista)
          })
        })
        t += totaleProfMese(prof, [], anno, m) // compensi fissi non filtrati per ora
      }
      totCOp += t; if (t > 0) byProf[prof.nome] = (byProf[prof.nome] || 0) + t
    })
    for (let m = 1; m <= 12; m++) {
      costiFissi.forEach(cf => { totCF += costoFissoFiltrato(cf, anno, m, vista) })
    }

    return { totF, totCOp, totCF, mg: totF - totCOp - totCF, byCliente, byProf, byMese }
  }, [progetti, professionisti, costiFissi, anno, vista])

  const iva = useMemo(() => [1,2,3,4].map(t => saldoIvaTrimestre(progetti, costiFissi, anno, t)), [progetti, costiFissi, anno])

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const { totF, totCOp, totCF, mg, byCliente, byProf, byMese } = stats
  const topClienti = Object.entries(byCliente).sort((a,b) => b[1]-a[1]).slice(0,6)
  const topProf = Object.entries(byProf).sort((a,b) => b[1]-a[1]).slice(0,6)
  const maxM = Math.max(...byMese, 1)
  const oggi = new Date()
  const trimCorrente = Math.ceil((oggi.getMonth()+1)/3)
  const scadenzeIva = ['16 maggio','20 agosto','16 novembre','16 febbraio '+(anno+1)]
  const nomiTrim = ['1° Trim. Gen–Mar','2° Trim. Apr–Giu','3° Trim. Lug–Set','4° Trim. Ott–Dic']

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Riepilogo finanziario completo</div>
        <div className="header-actions">
          <VistaToggle vista={vista} onChange={setVista} />
          <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ width: 120 }}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card gold">
            <div className="stat-label">Fatturato {anno}</div>
            <div className="stat-value">{fmt(totF)}</div>
            <div className="stat-note">+ IVA ≈ {fmt(totF * 1.22)}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Costi Operatori</div>
            <div className="stat-value">{fmt(totCOp)}</div>
            <div className="stat-note">Professionisti e collaboratori</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Costi Fissi</div>
            <div className="stat-value">{fmt(totCF)}</div>
            <div className="stat-note">{costiFissi.length} voci attive</div>
          </div>
          <div className={`stat-card ${mg >= 0 ? 'green' : 'red'}`}>
            <div className="stat-label">Margine Netto</div>
            <div className="stat-value">{fmt(mg)}</div>
            <div className="stat-note">{totF > 0 ? Math.round(mg/totF*100) : 0}% del fatturato</div>
          </div>
        </div>

        {/* Margine box */}
        <div className={`margine-box${mg < 0 ? ' negativo' : ''}`} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 500, color: mg >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {mg >= 0 ? '✓ Margine Positivo' : '⚠ Margine Negativo'} — {fmt(mg)}
              <span style={{ fontSize: 13, opacity: 0.8 }}> ({totF > 0 ? Math.round(mg/totF*100) : 0}%)</span>
            </span>
            <div style={{ display: 'flex', gap: 20, fontSize: 12, flexWrap: 'wrap' }}>
              <span>Fatturato: <strong className="text-gold">{fmt(totF)}</strong></span>
              <span>− Operatori: <strong className="text-red">{fmt(totCOp)}</strong></span>
              <span>− Fissi: <strong style={{ color: 'var(--purple)' }}>{fmt(totCF)}</strong></span>
              <span>= <strong style={{ color: mg >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(mg)}</strong></span>
            </div>
          </div>
        </div>

        {/* IVA */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">⚖ IVA {anno}</div>
          <div className="grid-4">
            {iva.map((s, i) => {
              const isProssimo = anno === oggi.getFullYear() && (i+1) === trimCorrente
              return (
                <div key={i} style={{ border: `${isProssimo ? '2px solid var(--gold)' : '1px solid var(--border)'}`, borderRadius: 10, padding: '14px 16px', background: isProssimo ? 'rgba(160,120,64,0.05)' : 'var(--surface)', position: 'relative' }}>
                  {isProssimo && <div style={{ position: 'absolute', top: -10, left: 12, background: 'var(--gold)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>PROSSIMO</div>}
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>{nomiTrim[i]}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: s.saldo > 0 ? 'var(--red)' : 'var(--green)', marginBottom: 6 }}>
                    {s.saldo > 0 ? fmt(s.saldo) : s.saldo < 0 ? 'Credito '+fmt(Math.abs(s.saldo)) : '€ 0'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Debito: {fmt(s.debito)} · Credito: {fmt(s.credito)}</div>
                  <div style={{ fontSize: 11, color: isProssimo ? 'var(--gold)' : 'var(--text-dim)', fontWeight: isProssimo ? 600 : 400, marginTop: 4 }}>Scadenza: {scadenzeIva[i]}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Clienti + Professionisti */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">Top Clienti per Fatturato</div>
            {topClienti.length === 0 ? <p className="text-muted" style={{ fontSize: 13 }}>Nessun cliente.</p> :
              topClienti.map(([n, v]) => (
                <div key={n} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{n}</span>
                    <span className="text-gold fw-500" style={{ fontSize: 13 }}>{fmt(v)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${v/topClienti[0][1]*100}%` }} /></div>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div className="card-title">Top Professionisti per Costi</div>
            {topProf.length === 0 ? <p className="text-muted" style={{ fontSize: 13 }}>Nessun costo.</p> :
              topProf.map(([n, v]) => (
                <div key={n} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{n}</span>
                    <span className="text-red fw-500" style={{ fontSize: 13 }}>{fmt(v)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill red" style={{ width: `${v/topProf[0][1]*100}%` }} /></div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Grafico mensile */}
        <div className="card">
          <div className="card-title">Fatturato mensile {anno}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120, paddingBottom: 4 }}>
            {byMese.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{v > 0 ? fmt(v).replace('€','').trim() : ''}</div>
                <div style={{ width: '100%', background: `rgba(160,120,64,${v > 0 ? '0.55' : '0.08'})`, borderRadius: '3px 3px 0 0', height: `${Math.max(v/maxM*80, 2)}px`, transition: 'height 0.3s ease' }} />
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{MESI[i].slice(0,3)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
