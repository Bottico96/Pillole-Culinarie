import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import {
  fmt, MESI, saldoIvaTrimestre,
  fatturatoFiltrato, costoOperatoreFiltrato, costoFissoFiltrato, totaleProfMese
} from '../../lib/calc'
import { VistaToggle } from '../ui/FormComponents'

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:'24px 16px', overflowY:'auto', backdropFilter:'blur(4px)' },
  panel: { background:'var(--cream)', border:'1px solid var(--line)', borderRadius:16, width:'100%', maxWidth:900, boxShadow:'0 8px 32px rgba(0,0,0,.12)', marginTop:8 },
  panelHead: { background:'var(--ink)', padding:'16px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  panelTitle: { fontFamily:'var(--font-head)', fontSize:14, fontWeight:800, textTransform:'uppercase', letterSpacing:'.5px', color:'#fff' },
  closeBtn: { background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:20, cursor:'pointer' },
  statRow: { display:'flex', gap:16, padding:'14px 24px', background:'rgba(82,161,163,.06)', borderBottom:'1px solid var(--line)', flexWrap:'wrap' },
  statBox: { display:'flex', flexDirection:'column', gap:2 },
  statLabel: { fontSize:10, textTransform:'uppercase', letterSpacing:'.4px', color:'var(--muted)', fontWeight:600 },
  statVal: { fontSize:18, fontWeight:800, fontFamily:'var(--font-head)' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { padding:'8px 12px', fontSize:11, textTransform:'uppercase', letterSpacing:'.4px', color:'var(--muted)', fontWeight:700, borderBottom:'2px solid var(--line)', textAlign:'left' },
  td: { padding:'10px 12px', fontSize:13, borderBottom:'1px solid var(--line)' },
}

function PanelOverlay({ onClose, children }) {
  return (
    <div style={S.overlay} onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div style={S.panel}>{children}</div>
    </div>
  )
}

export default function Dashboard() {
  const { progetti, professionisti, costiFissi, fattureEmesse, loading } = useData()
  const navigate = useNavigate()
  const [anno, setAnno] = useState(2026)
  const [vista, setVista] = useState('tot')
  const [pannello, setPannello] = useState(null) // { tipo: 'cliente'|'prof'|'mese', data }

  const stats = useMemo(() => {
    let totF = 0, totCOp = 0, totCF = 0
    const byCliente = {}, byProf = {}, byMese = Array(12).fill(0)

    progetti.forEach(p => {
      for (let m = 1; m <= 12; m++) {
        const f = fatturatoFiltrato(p, anno, m, vista)
        totF += f; byMese[m-1] += f
        if (f > 0) byCliente[p.cliente] = (byCliente[p.cliente] || 0) + f
      }
    })
    professionisti.forEach(prof => {
      let t = 0
      for (let m = 1; m <= 12; m++) {
        progetti.forEach(p => {
          ;(p.costi||[]).forEach(c => {
            if (String(c.profId) === String(prof.id)) t += costoOperatoreFiltrato(c, p, anno, m, vista)
          })
        })
      }
      // also add direct project costs for this prof (importo * mesi)
      progetti.forEach(p => {
        ;(p.costi||[]).forEach(c => {
          if (String(c.profId) === String(prof.id) && c.tipo !== 'mensile') {
            // one-off costs not caught by monthly filter — add once
          }
        })
      })
      totCOp += t; if (t > 0) byProf[prof.nome] = (byProf[prof.nome] || 0) + t
    })
    for (let m = 1; m <= 12; m++) {
      costiFissi.forEach(cf => { totCF += costoFissoFiltrato(cf, anno, m, vista) })
    }

    return { totF, totCOp, totCF, mg: totF-totCOp-totCF, byCliente, byProf, byMese }
  }, [progetti, professionisti, costiFissi, anno, vista])

  const iva = useMemo(() => [1,2,3,4].map(t => saldoIvaTrimestre(progetti, costiFissi, anno, t)), [progetti, costiFissi, anno])

  if (loading) return <div className="loading-screen"><div className="loading-spinner"/></div>

  const { totF, totCOp, totCF, mg, byCliente, byProf, byMese } = stats
  const topClienti = Object.entries(byCliente).sort((a,b) => b[1]-a[1]).slice(0,6)
  const topProf = Object.entries(byProf).sort((a,b) => b[1]-a[1]).slice(0,6)
  const maxM = Math.max(...byMese, 1)
  const oggi = new Date()
  const trimCorrente = Math.ceil((oggi.getMonth()+1)/3)
  const scadenzeIva = ['16 maggio','20 agosto','16 novembre','16 febbraio '+(anno+1)]
  const nomiTrim = ['1° Trim. Gen–Mar','2° Trim. Apr–Giu','3° Trim. Lug–Set','4° Trim. Ott–Dic']

  // --- Pannello Cliente ---
  function PannelloCliente({ nome, onClose }) {
    const progetti_cliente = progetti.filter(p => p.cliente === nome)
    const totFatt = progetti_cliente.reduce((s,p) => {
      let f = 0; for(let m=1;m<=12;m++) f += fatturatoFiltrato(p,anno,m,vista); return s+f
    }, 0)
    const totCosti = progetti_cliente.reduce((s,p) => {
      let c_tot = 0
      for (let m = 1; m <= 12; m++) {
        ;(p.costi||[]).forEach(c => { c_tot += costoOperatoreFiltrato(c, p, anno, m, vista) })
      }
      return s + c_tot
    }, 0)
    const profCoinvolti = [...new Set(progetti_cliente.flatMap(p => (p.costi||[]).map(c => {
      const prof = professionisti.find(pr => pr.id === c.profId)
      return prof?.nome || null
    }).filter(Boolean)))]

    return (
      <PanelOverlay onClose={onClose}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>👤 {nome}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.statRow}>
          <div style={S.statBox}><span style={S.statLabel}>Fatturato totale</span><span style={{...S.statVal, color:'var(--teal-d)'}}>{fmt(totFatt)}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Costi totali</span><span style={{...S.statVal, color:'var(--red)'}}>{fmt(totCosti)}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Margine</span><span style={{...S.statVal, color:(totFatt-totCosti)>=0?'var(--teal-d)':'var(--red)'}}>{fmt(totFatt-totCosti)}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Progetti</span><span style={S.statVal}>{progetti_cliente.length}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Operatori</span><span style={{...S.statVal, fontSize:14}}>{profCoinvolti.join(', ')||'—'}</span></div>
        </div>
        <div style={{ padding:'16px 24px', maxHeight:'55vh', overflowY:'auto' }}>
          {progetti_cliente.length === 0 ? <p style={{color:'var(--muted)',fontSize:13}}>Nessun progetto.</p> :
            progetti_cliente.map(p => {
              let fatt = 0; for(let m=1;m<=12;m++) fatt += fatturatoFiltrato(p,anno,m,vista)
              let costi = 0
              for (let m = 1; m <= 12; m++) {
                ;(p.costi||[]).forEach(c => { costi += costoOperatoreFiltrato(c, p, anno, m, vista) })
              }
              const margine = fatt - costi
              const profs = [...new Set((p.costi||[]).map(c => {
                const prof = professionisti.find(pr => pr.id === c.profId)
                return prof?.nome || null
              }).filter(Boolean))]
              return (
                <div key={p._fsId||p.id} style={{ background:'#fff', border:'1px solid var(--line)', borderRadius:10, padding:'14px 16px', marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{p.nome||p.progetto||'—'}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{p.statoProgetto||'—'}</div>
                    </div>
                    <button onClick={()=>{onClose();navigate('/progetti', { state: { filtroProgetto: p.nome||p.progetto } })}} style={{ fontSize:11, padding:'4px 10px', background:'var(--ink)', color:'#fff', border:'none', borderRadius:6, cursor:'pointer' }}>Vai al progetto →</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                    {[
                      {label:'Fatturato', val:fmt(fatt), col:'var(--teal-d)'},
                      {label:'Costi', val:fmt(costi), col:'var(--red)'},
                      {label:'Margine', val:fmt(margine), col:margine>=0?'var(--teal-d)':'var(--red)'},
                      {label:'Operatori', val:profs.join(', ')||'—'},
                    ].map(({label,val,col})=>(
                      <div key={label} style={{ background:'var(--cream-d)', borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, textTransform:'uppercase', color:'var(--muted)', marginBottom:2 }}>{label}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:col||'var(--ink)' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          }
        </div>
      </PanelOverlay>
    )
  }

  // --- Pannello Professionista ---
  function PannelloProf({ nome, onClose }) {
    const prof = professionisti.find(p => p.nome === nome)
    const progetti_prof = progetti.filter(p => (p.costi||[]).some(c => String(c.profId)===String(prof?.id)))
    let totComp = 0
    const righe = progetti_prof.map(p => {
      const costi_prof = (p.costi||[]).filter(c => String(c.profId)===String(prof?.id))
      let comp = 0
      for (let m = 1; m <= 12; m++) {
        costi_prof.forEach(c => { comp += costoOperatoreFiltrato(c, p, anno, m, vista) })
      }
      totComp += comp
      return { progetto: p.nome||p.progetto, cliente: p.cliente, comp, servizi: costi_prof.map(c=>c.tipo||'').filter(Boolean) }
    })

    return (
      <PanelOverlay onClose={onClose}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>🎯 {nome}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.statRow}>
          <div style={S.statBox}><span style={S.statLabel}>Compenso totale {anno}</span><span style={{...S.statVal, color:'var(--red)'}}>{fmt(totComp)}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Progetti coinvolto</span><span style={S.statVal}>{righe.length}</span></div>
        </div>
        <div style={{ padding:'16px 24px', maxHeight:'55vh', overflowY:'auto' }}>
          {righe.length === 0 ? <p style={{color:'var(--muted)',fontSize:13}}>Nessun progetto trovato.</p> :
            <table style={S.table}>
              <thead>
                <tr>
                  {['Progetto','Cliente','Servizi','Compenso'].map(h=>(
                    <th key={h} style={{...S.th, textAlign:h==='Compenso'?'right':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {righe.map((r,i)=>(
                  <tr key={i} style={{ background: i%2===0?'#fff':'var(--cream-d)' }}>
                    <td style={S.td}>{r.progetto}</td>
                    <td style={S.td}>{r.cliente}</td>
                    <td style={{...S.td, fontSize:12, color:'var(--muted)'}}>{r.servizi.slice(0,2).join(', ')||'—'}</td>
                    <td style={{...S.td, textAlign:'right', fontWeight:700, color:'var(--red)'}}>{fmt(r.comp)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop:'2px solid var(--line)' }}>
                  <td colSpan={3} style={{...S.td, fontWeight:700}}>Totale</td>
                  <td style={{...S.td, textAlign:'right', fontWeight:800, color:'var(--red)', fontSize:15}}>{fmt(totComp)}</td>
                </tr>
              </tbody>
            </table>
          }
        </div>
      </PanelOverlay>
    )
  }

  // --- Pannello Mese ---
  function PannelloMese({ meseIdx, onClose }) {
    const mese = MESI[meseIdx]
    const anno_str = String(anno)
    const mese_str = String(meseIdx+1).padStart(2,'0')
    const fatture = (fattureEmesse||[]).filter(f => {
      const d = f.data||f.dataEmissione||f.mese||''
      return String(d).startsWith(`${anno_str}-${mese_str}`) || String(d).startsWith(`${mese_str}/${anno_str}`)
    })
    const totMese = byMese[meseIdx]

    return (
      <PanelOverlay onClose={onClose}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>📅 Fatturato {mese} {anno}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.statRow}>
          <div style={S.statBox}><span style={S.statLabel}>Fatturato mese</span><span style={{...S.statVal, color:'var(--teal-d)'}}>{fmt(totMese)}</span></div>
          <div style={S.statBox}><span style={S.statLabel}>Fatture emesse</span><span style={S.statVal}>{fatture.length}</span></div>
        </div>
        <div style={{ padding:'16px 24px', maxHeight:'55vh', overflowY:'auto' }}>
          {fatture.length === 0 ? (
            <div>
              <p style={{color:'var(--muted)',fontSize:13,marginBottom:8}}>Nessuna fattura emessa trovata per questo mese.</p>
              <p style={{color:'var(--muted)',fontSize:12}}>Il fatturato di {fmt(totMese)} è calcolato dai dati di progetto.</p>
              {(() => {
                const voci = progetti.filter(p => {
                  let f = 0; for(let m_=meseIdx+1;m_<=meseIdx+1;m_++) f += fatturatoFiltrato(p,anno,m_,vista); return f>0
                }).map(p => {
                  let f = 0; for(let m_=meseIdx+1;m_<=meseIdx+1;m_++) f += fatturatoFiltrato(p,anno,m_,vista); return {nome:p.nome||p.progetto, cliente:p.cliente, f}
                })
                return voci.length>0 ? (
                  <table style={{...S.table, marginTop:12}}>
                    <thead><tr>{['Progetto','Cliente','Importo'].map(h=><th key={h} style={{...S.th,textAlign:h==='Importo'?'right':'left'}}>{h}</th>)}</tr></thead>
                    <tbody>{voci.map((v,i)=>(
                      <tr key={i} style={{background:i%2===0?'#fff':'var(--cream-d)'}}>
                        <td style={S.td}>{v.nome}</td>
                        <td style={S.td}>{v.cliente}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700,color:'var(--teal-d)'}}>{fmt(v.f)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : null
              })()}
            </div>
          ) : (
            <table style={S.table}>
              <thead><tr>{['Data','Cliente','Progetto','Importo','Stato'].map(h=><th key={h} style={{...S.th,textAlign:h==='Importo'?'right':'left'}}>{h}</th>)}</tr></thead>
              <tbody>
                {fatture.map((f,i)=>(
                  <tr key={i} style={{background:i%2===0?'#fff':'var(--cream-d)'}}>
                    <td style={S.td}>{f.data||f.dataEmissione||'—'}</td>
                    <td style={S.td}>{f.cliente||f.clienteNome||'—'}</td>
                    <td style={S.td}>{f.progetto||f.nomeProgetto||'—'}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,color:'var(--teal-d)'}}>{fmt(parseFloat(f.importo||f.importoNetto||0))}</td>
                    <td style={S.td}><span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'rgba(82,161,163,.12)',color:'var(--teal-d)',fontWeight:600}}>{f.stato||'—'}</span></td>
                  </tr>
                ))}
                <tr style={{borderTop:'2px solid var(--line)'}}>
                  <td colSpan={3} style={{...S.td,fontWeight:700}}>Totale</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:800,color:'var(--teal-d)',fontSize:15}}>{fmt(fatture.reduce((s,f)=>s+(parseFloat(f.importo||f.importoNetto||0)),0))}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </PanelOverlay>
    )
  }

  return (
    <>
      {pannello?.tipo === 'cliente' && <PannelloCliente nome={pannello.nome} onClose={()=>setPannello(null)} />}
      {pannello?.tipo === 'prof' && <PannelloProf nome={pannello.nome} onClose={()=>setPannello(null)} />}
      {pannello?.tipo === 'mese' && <PannelloMese meseIdx={pannello.idx} onClose={()=>setPannello(null)} />}

      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Riepilogo finanziario completo</div>
        <div className="header-actions">
          <VistaToggle vista={vista} onChange={setVista} />
          <select value={anno} onChange={e=>setAnno(parseInt(e.target.value))} style={{width:120}}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        <div className="grid-4" style={{marginBottom:20}}>
          <div className="stat-card gold" onClick={()=>navigate('/progetti')} style={{cursor:'pointer'}} title="Vai ai Progetti">
            <div className="stat-label">Fatturato {anno} →</div>
            <div className="stat-value">{fmt(totF)}</div>
            <div className="stat-note">+ IVA ≈ {fmt(totF*1.22)}</div>
          </div>
          <div className="stat-card red" onClick={()=>navigate('/professionisti')} style={{cursor:'pointer'}} title="Vai ai Professionisti">
            <div className="stat-label">Costi Operatori →</div>
            <div className="stat-value">{fmt(totCOp)}</div>
            <div className="stat-note">Professionisti e collaboratori</div>
          </div>
          <div className="stat-card purple" onClick={()=>navigate('/costifissi')} style={{cursor:'pointer'}} title="Vai ai Costi Fissi">
            <div className="stat-label">Costi Fissi →</div>
            <div className="stat-value">{fmt(totCF)}</div>
            <div className="stat-note">{costiFissi.length} voci attive</div>
          </div>
          <div className={`stat-card ${mg>=0?'green':'red'}`}>
            <div className="stat-label">Margine Netto</div>
            <div className="stat-value">{fmt(mg)}</div>
            <div className="stat-note">{totF>0?Math.round(mg/totF*100):0}% del fatturato</div>
          </div>
        </div>

        {/* Margine box */}
        <div className={`margine-box${mg<0?' negativo':''}`} style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
            <span style={{fontFamily:"'Cormorant Garamond', serif",fontSize:17,fontWeight:500,color:mg>=0?'var(--green)':'var(--red)'}}>
              {mg>=0?'✓ Margine Positivo':'⚠ Margine Negativo'} — {fmt(mg)}
              <span style={{fontSize:13,opacity:0.8}}> ({totF>0?Math.round(mg/totF*100):0}%)</span>
            </span>
            <div style={{display:'flex',gap:20,fontSize:12,flexWrap:'wrap'}}>
              <span>Fatturato: <strong className="text-gold">{fmt(totF)}</strong></span>
              <span>− Operatori: <strong className="text-red">{fmt(totCOp)}</strong></span>
              <span>− Fissi: <strong style={{color:'var(--purple)'}}>{fmt(totCF)}</strong></span>
              <span>= <strong style={{color:mg>=0?'var(--green)':'var(--red)'}}>{fmt(mg)}</strong></span>
            </div>
          </div>
        </div>

        {/* IVA */}
        <div className="card" style={{marginBottom:20}}>
          <div className="card-title">⚖ IVA {anno}</div>
          <div className="grid-4">
            {iva.map((s,i)=>{
              const isProssimo = anno===oggi.getFullYear()&&(i+1)===trimCorrente
              return (
                <div key={i} style={{border:`${isProssimo?'2px solid var(--gold)':'1px solid var(--border)'}`,borderRadius:10,padding:'14px 16px',background:isProssimo?'rgba(160,120,64,0.05)':'var(--surface)',position:'relative'}}>
                  {isProssimo&&<div style={{position:'absolute',top:-10,left:12,background:'var(--gold)',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10}}>PROSSIMO</div>}
                  <div style={{fontSize:12,fontWeight:600,color:'var(--text-dim)',marginBottom:8}}>{nomiTrim[i]}</div>
                  <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:22,fontWeight:600,color:s.saldo>0?'var(--red)':'var(--green)',marginBottom:6}}>
                    {s.saldo>0?fmt(s.saldo):s.saldo<0?'Credito '+fmt(Math.abs(s.saldo)):'€ 0'}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-dim)'}}>Debito: {fmt(s.debito)} · Credito: {fmt(s.credito)}</div>
                  <div style={{fontSize:11,color:isProssimo?'var(--gold)':'var(--text-dim)',fontWeight:isProssimo?600:400,marginTop:4}}>Scadenza: {scadenzeIva[i]}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Clienti + Professionisti */}
        <div className="grid-2" style={{marginBottom:20}}>
          <div className="card">
            <div className="card-title">Top Clienti per Fatturato</div>
            {topClienti.length===0?<p className="text-muted" style={{fontSize:13}}>Nessun cliente.</p>:
              topClienti.map(([n,v])=>(
                <div key={n} style={{marginBottom:12,cursor:'pointer'}} onClick={()=>setPannello({tipo:'cliente',nome:n})}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--teal-d)',textDecoration:'underline dotted'}}>{n}</span>
                    <span className="text-gold fw-500" style={{fontSize:13}}>{fmt(v)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${v/topClienti[0][1]*100}%`}}/></div>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div className="card-title">Top Professionisti per Costi</div>
            {topProf.length===0?<p className="text-muted" style={{fontSize:13}}>Nessun costo.</p>:
              topProf.map(([n,v])=>(
                <div key={n} style={{marginBottom:12,cursor:'pointer'}} onClick={()=>setPannello({tipo:'prof',nome:n})}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--red)',textDecoration:'underline dotted'}}>{n}</span>
                    <span className="text-red fw-500" style={{fontSize:13}}>{fmt(v)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill red" style={{width:`${v/topProf[0][1]*100}%`}}/></div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Grafico mensile */}
        <div className="card">
          <div className="card-title">Fatturato mensile {anno}</div>
          <div style={{display:'flex',gap:8,alignItems:'flex-end',height:140,paddingBottom:4}}>
            {byMese.map((v,i)=>(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer'}}
                onClick={()=>setPannello({tipo:'mese',idx:i})}
                title={`${MESI[i]}: ${fmt(v)}`}>
                <div style={{fontSize:10,color:'var(--text-dim)'}}>{v>0?fmt(v).replace('€','').trim():''}</div>
                <div style={{width:'100%',background:`rgba(160,120,64,${v>0?'0.55':'0.08'})`,borderRadius:'3px 3px 0 0',height:`${Math.max(v/maxM*100,2)}px`,transition:'height 0.3s ease',border:v>0?'1px solid rgba(160,120,64,.3)':'none'}}/>
                <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600}}>{MESI[i].slice(0,3)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
