import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, cols } from '../../lib/db'
import {
  fmt, fmtDate, MESI,
  fatturatoCliente, costoOperatoreMese,
  compensiFissiMese, costoFissoMese, applyIva
} from '../../lib/calc'
import { VistaToggle, VistaBadge } from '../ui/FormComponents'

// Ogni voce spostata viene salvata in un array `spostamentiFatture` sul progetto:
// { tipo:'cliente'|'prof', profId?, meseOrig, annoOrig, meseDest, annoDest }
// Questo permette di sapere esattamente da dove e dove è stata spostata ogni voce.

export default function Calendario() {
  const { progetti, professionisti, costiFissi, fattureEmesse, fattureRicevute, loading } = useData()
  const [anno, setAnno] = useState(2026)
  const [mese, setMese] = useState(new Date().getMonth() + 1)
  const [vista, setVista] = useState('bdg')
  const [spostaModal, setSpostaModal] = useState(null)

  // ── Calcolo dati del mese ──────────────────────────────────────
  const { righeClienti, profMap, cfMese, totF, totCOp, totCF, mg } = useMemo(() => {
    const emesseMeseIds = new Set(
      fattureEmesse.filter(f => f.mese === mese && f.anno === anno).map(f => f.progettoId)
    )
    const ricevuteMeseChiavi = new Set(
      fattureRicevute.filter(f => f.mese === mese && f.anno === anno).map(f => f.chiave)
    )

    // CONSUNTIVO
    if (vista === 'cons') {
      const righeClienti = fattureEmesse
        .filter(f => f.mese === mese && f.anno === anno)
        .map(f => ({ progettoId: f.progettoId, cliente: f.cliente, servizio: f.servizio || f.cliente, importo: parseFloat(f.importo) || 0, tipo: 'emessa', desc: '', data: f.data }))
      const profMapCons = {}
      fattureRicevute.filter(f => f.mese === mese && f.anno === anno).forEach(f => {
        if (!profMapCons[f.profId]) {
          const prof = professionisti.find(p => p.id === f.profId) || { id: f.profId, nome: f.profNome, ruolo: '', piva: '' }
          profMapCons[f.profId] = { prof, entries: [] }
        }
        profMapCons[f.profId].entries.push({ desc: f.voceDes, importo: parseFloat(f.importo) || 0, fisso: false, key: f.chiave, fattura: f })
      })
      const cfMeseCons = costiFissi.map(cf => ({ cf, importo: costoFissoMese(cf, anno, mese) })).filter(x => x.importo > 0 && (x.cf.mesiConsuntivati || []).includes(mese))
      const totF = righeClienti.reduce((a, r) => a + r.importo, 0)
      const totCOp = Object.values(profMapCons).reduce((a, x) => a + x.entries.reduce((b, e) => b + e.importo, 0), 0)
      const totCF = cfMeseCons.reduce((a, x) => a + x.importo, 0)
      return { righeClienti, profMap: profMapCons, cfMese: cfMeseCons, totF, totCOp, totCF, mg: totF - totCOp - totCF }
    }

    // BUDGET: costruiamo le righe tenendo conto degli spostamenti
    const righeClienti = []

    progetti.forEach(p => {
      const spost = p.spostamentiFatture || []

      // Voce spostata IN questo mese da un altro mese?
      const entrante = spost.find(s => s.tipo === 'cliente' && s.meseDest === mese && s.annoDest === anno)
      if (entrante && !emesseMeseIds.has(p.id)) {
        const f = fatturatoCliente(p, entrante.annoOrig, entrante.meseOrig)
        if (f > 0) {
          righeClienti.push({
            progettoId: p.id, cliente: p.nome || p.cliente,
            servizio: p.nome || p.cliente,
            importo: f, tipo: p.tipo,
            desc: `(spost. da ${MESI[entrante.meseOrig-1]})`, data: '',
            spostata: true
          })
        }
        return
      }

      // Voce spostata FUORI da questo mese?
      const uscente = spost.find(s => s.tipo === 'cliente' && s.meseOrig === mese && s.annoOrig === anno)
      if (uscente) return

      // Voce normale
      if (emesseMeseIds.has(p.id)) return
      const f = fatturatoCliente(p, anno, mese)
      if (f <= 0) return

      if (p.tipo === 'spot' && p.scadenze?.length > 0) {
        p.scadenze
          .filter(sc => { if (!sc.data) return false; const d = new Date(sc.data + 'T00:00:00'); return d.getFullYear() === anno && d.getMonth() + 1 === mese })
          .forEach(sc => righeClienti.push({ progettoId: p.id, cliente: p.nome || p.cliente, servizio: p.nome || p.cliente, importo: parseFloat(sc.importo) || 0, tipo: 'spot', desc: sc.desc, data: sc.data }))
      } else {
        righeClienti.push({ progettoId: p.id, cliente: p.nome || p.cliente, servizio: p.nome || p.cliente, importo: f, tipo: p.tipo, desc: '', data: '' })
      }
    })

    // PROFESSIONISTI con spostamenti
    const profMap = {}
    professionisti.forEach(prof => {
      const entriesMap = {}
      progetti.forEach(p => {
        const spost = p.spostamentiFatture || []
        ;(p.costi || []).forEach(c => {
          if (String(c.profId) !== String(prof.id)) return

          // Voce spostata IN questo mese?
          const entrante = spost.find(s => s.tipo === 'prof' && String(s.profId) === String(prof.id) && s.meseDest === mese && s.annoDest === anno)
          if (entrante) {
            const imp = costoOperatoreMese(c, p, entrante.annoOrig, entrante.meseOrig)
            if (imp <= 0) return
            const key = `fr_${prof.id}_${((p.nome||p.cliente)+'__'+p.id).replace(/[^a-zA-Z0-9]/g,'').slice(0,15)}_${mese}_${anno}`
            if (ricevuteMeseChiavi.has(key)) return
            const dk = (p.nome || p.cliente) + '__' + p.id
            entriesMap[dk] = { imp: (entriesMap[dk]?.imp || 0) + imp, key, progettoId: p.id, spostata: true, meseOrig: entrante.meseOrig }
            return
          }

          // Voce spostata FUORI da questo mese?
          const uscente = spost.find(s => s.tipo === 'prof' && String(s.profId) === String(prof.id) && s.meseOrig === mese && s.annoOrig === anno)
          if (uscente) return

          // Voce normale
          const imp = costoOperatoreMese(c, p, anno, mese)
          if (imp <= 0) return
          const key = `fr_${prof.id}_${((p.nome||p.cliente)+'__'+p.id).replace(/[^a-zA-Z0-9]/g,'').slice(0,15)}_${mese}_${anno}`
          if (ricevuteMeseChiavi.has(key)) return
          const dk = (p.nome || p.cliente) + '__' + p.id
          entriesMap[dk] = { imp: (entriesMap[dk]?.imp || 0) + imp, key, progettoId: p.id }
        })
      })

      const fissi = compensiFissiMese(prof, anno, mese)
      if (fissi > 0) {
        const fKey = `fr_${prof.id}_fisso_${mese}_${anno}`
        if (!ricevuteMeseChiavi.has(fKey)) entriesMap['__fisso__'] = { imp: fissi, key: fKey }
      }

      const entries = Object.entries(entriesMap).map(([k, { imp, key, progettoId, spostata, meseOrig }]) => ({
        desc: k === '__fisso__' ? 'Compenso fisso aziendale' : k.split('__')[0],
        importo: imp, fisso: k === '__fisso__', key,
        progettoId: k === '__fisso__' ? null : progettoId || null,
        spostata, meseOrig
      }))

      if (entries.length > 0) profMap[prof.id] = { prof, entries }
    })

    const cfMese = costiFissi.map(cf => ({ cf, importo: costoFissoMese(cf, anno, mese) })).filter(x => x.importo > 0)
    const totF = righeClienti.reduce((a, r) => a + r.importo, 0)
    const totCOp = Object.values(profMap).reduce((a, x) => a + x.entries.reduce((b, e) => b + e.importo, 0), 0)
    const totCF = cfMese.reduce((a, x) => a + x.importo, 0)
    return { righeClienti, profMap, cfMese, totF, totCOp, totCF, mg: totF - totCOp - totCF }
  }, [progetti, professionisti, costiFissi, fattureEmesse, fattureRicevute, anno, mese, vista])

  const emesseMese = fattureEmesse.filter(f => f.mese === mese && f.anno === anno)
  const ricevuteMese = fattureRicevute.filter(f => f.mese === mese && f.anno === anno)
  const isEmessa = (progettoId) => emesseMese.some(f => f.progettoId === progettoId)
  const isRicevuta = (key) => fattureRicevute.some(f => f.chiave === key && f.mese === mese && f.anno === anno)

  // ── Azioni ───────────────────────────────────────────────────
  const segnaEmessa = async (riga) => {
    if (isEmessa(riga.progettoId)) return
    await addItem(cols.fattureEmesse, { progettoId: riga.progettoId, cliente: riga.cliente, servizio: riga.servizio, importo: riga.importo, mese, anno, data: new Date().toISOString().split('T')[0] })
    const progetto = progetti.find(p => p.id === riga.progettoId)
    if (progetto) {
      const mesiCons = [...(progetto.mesiConsuntivati || [])]
      if (!mesiCons.includes(mese)) await updateItem(cols.progetti, progetto.id, { ...progetto, mesiConsuntivati: [...mesiCons, mese].sort((a, b) => a - b) })
    }
  }

  const annullaEmessa = async (id, progettoId) => {
    if (!window.confirm('Annullare? La fattura tornerà nelle "da emettere".')) return
    const { deleteItem } = await import('../../lib/db')
    await deleteItem(cols.fattureEmesse, id)
    const progetto = progetti.find(p => p.id === progettoId)
    if (progetto) await updateItem(cols.progetti, progetto.id, { ...progetto, mesiConsuntivati: (progetto.mesiConsuntivati || []).filter(m => m !== mese) })
  }

  const segnaRicevuta = async (entry, prof) => {
    if (isRicevuta(entry.key)) return
    await addItem(cols.fattureRicevute, { chiave: entry.key, profId: prof.id, profNome: prof.nome, voceDes: entry.desc, importo: entry.importo, mese, anno, data: new Date().toISOString().split('T')[0] })
    for (const progetto of progetti) {
      const costiAggiornati = (progetto.costi || []).map(c => {
        if (String(c.profId) !== String(prof.id)) return c
        const imp = costoOperatoreMese(c, progetto, anno, mese)
        if (imp <= 0) return c
        return { ...c, bdg_cons: 'cons' }
      })
      if (costiAggiornati.some((c, i) => c.bdg_cons !== (progetto.costi || [])[i]?.bdg_cons))
        await updateItem(cols.progetti, progetto.id, { ...progetto, costi: costiAggiornati })
    }
  }

  const annullaRicevuta = async (fattura) => {
    if (!window.confirm('Annullare? La fattura tornerà nelle "da ricevere".')) return
    const { deleteItem } = await import('../../lib/db')
    await deleteItem(cols.fattureRicevute, fattura.id)
    for (const progetto of progetti) {
      const costiAggiornati = (progetto.costi || []).map(c => {
        if (String(c.profId) !== String(fattura.profId)) return c
        const imp = costoOperatoreMese(c, progetto, anno, mese)
        if (imp <= 0) return c
        return { ...c, bdg_cons: 'bdg' }
      })
      if (costiAggiornati.some((c, i) => c.bdg_cons !== (progetto.costi || [])[i]?.bdg_cons))
        await updateItem(cols.progetti, progetto.id, { ...progetto, costi: costiAggiornati })
    }
  }

  const pagaCostoFisso = async (cf) => {
    const chiave = `${anno}-${mese}`
    const mesiPagati = [...(cf.mesiPagati || [])]
    if (!mesiPagati.includes(chiave)) mesiPagati.push(chiave)
    await updateItem(cols.costiFissi, cf.id, { ...cf, mesiPagati })
  }

  const annullaPagamento = async (cf) => {
    await updateItem(cols.costiFissi, cf.id, { ...cf, mesiPagati: (cf.mesiPagati || []).filter(k => k !== `${anno}-${mese}`) })
  }

  const spostaCostoFisso = async (cf, nuovaData) => {
    const d = new Date(nuovaData + 'T00:00:00')
    await updateItem(cols.costiFissi, cf.id, { ...cf, giorno: d.getDate(), meseInizio: d.getMonth() + 1, annoInizio: d.getFullYear() })
    setSpostaModal(null)
  }

  const spostaVoce = async (tipo, item, nuovaData) => {
    const d = new Date(nuovaData + 'T00:00:00')
    const meseDest = d.getMonth() + 1
    const annoDest = d.getFullYear()

    if (tipo === 'emessa_cons') {
      // sposta fattura già emessa (consuntivo) → aggiorna direttamente su Firestore
      await updateItem(cols.fattureEmesse, item.id, { ...item, mese: meseDest, anno: annoDest, data: nuovaData })
    } else if (tipo === 'bdg_emessa') {
      // sposta fattura budget → salva spostamento sul progetto
      const prog = progetti.find(p => p.id === item.progettoId)
      if (prog) {
        if (prog.tipo === 'spot' && item.data) {
          // spot con data: aggiorna la scadenza
          const scadenze = (prog.scadenze || []).map(sc => sc.data === item.data ? { ...sc, data: nuovaData } : sc)
          await updateItem(cols.progetti, prog.id, { ...prog, scadenze })
        } else {
          // ricorrente: salva spostamento
          const spostamentiFatture = [...(prog.spostamentiFatture || [])].filter(
            s => !(s.tipo === 'cliente' && s.meseOrig === mese && s.annoOrig === anno)
          )
          spostamentiFatture.push({ tipo: 'cliente', meseOrig: mese, annoOrig: anno, meseDest, annoDest })
          await updateItem(cols.progetti, prog.id, { ...prog, spostamentiFatture })
        }
      }
    } else if (tipo === 'bdg_ricevuta') {
      // sposta fattura professionista budget → salva spostamento sul progetto specifico
      const prog = item.progettoId ? progetti.find(p => p.id === item.progettoId) : null
      if (prog) {
        const profId = item.prof?.id
        const spostamentiFatture = [...(prog.spostamentiFatture || [])].filter(
          s => !(s.tipo === 'prof' && String(s.profId) === String(profId) && s.meseOrig === mese && s.annoOrig === anno)
        )
        spostamentiFatture.push({ tipo: 'prof', profId, meseOrig: mese, annoOrig: anno, meseDest, annoDest })
        await updateItem(cols.progetti, prog.id, { ...prog, spostamentiFatture })
      }
    }
    setSpostaModal(null)
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const pendentiClienti = righeClienti.filter(r => !isEmessa(r.progettoId))
  const pendentiProf = Object.values(profMap).filter(({ entries }) => entries.some(e => !isRicevuta(e.key)))

  const BadgeSpostata = ({ meseOrig }) => meseOrig ? (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(82,161,163,.15)', color: 'var(--teal-d)', fontWeight: 600, marginLeft: 4 }}>
      📅 da {MESI[meseOrig-1]}
    </span>
  ) : null

  return (
    <>
      <div className="page-header">
        <div className="page-title">Calendario Mensile</div>
        <div className="page-sub">Fatture da emettere e da ricevere</div>
        <div className="header-actions">
          <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ width: 100 }}>
            <option value={2025}>2025</option><option value={2026}>2026</option><option value={2027}>2027</option>
          </select>
          <VistaToggle vista={vista} onChange={setVista} />
        </div>
      </div>

      <div className="content">
        <div className="month-bar">
          {MESI.map((m, i) => (
            <div key={i} className={`month-chip${mese === i + 1 ? ' active' : ''}`} onClick={() => setMese(i + 1)}>{m}</div>
          ))}
        </div>

        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
          Visualizzando: <VistaBadge vista={vista} />
          {vista === 'cons' && <span>— Solo fatture e costi già realizzati</span>}
          {vista === 'bdg' && <span>— Previsioni del mese, clicca ✓ per consuntivare</span>}
        </div>

        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-card gold"><div className="stat-label">Entrate – {MESI[mese-1]}</div><div className="stat-value">{fmt(totF)}</div><div className="stat-note">+ IVA ≈ {fmt(totF*1.22)}</div></div>
          <div className="stat-card red"><div className="stat-label">Costi Operatori</div><div className="stat-value">{fmt(totCOp)}</div><div className="stat-note">{Object.keys(profMap).length} professionista/i</div></div>
          <div className="stat-card purple"><div className="stat-label">Costi Fissi</div><div className="stat-value">{fmt(totCF)}</div><div className="stat-note">{cfMese.length} voci</div></div>
          <div className={`stat-card ${mg>=0?'green':'red'}`}><div className="stat-label">Margine Netto</div><div className="stat-value">{fmt(mg)}</div><div className="stat-note">{totF>0?Math.round(mg/totF*100):0}% del fatturato</div></div>
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          {/* CLIENTI */}
          <div className="card">
            {vista === 'cons' ? (
              <>
                <div className="card-title" style={{ color:'var(--green)' }}>✓ Fatture Emesse – {MESI[mese-1]}</div>
                {emesseMese.length === 0
                  ? <p style={{ fontSize:13, color:'var(--text-muted)' }}>Nessuna fattura emessa questo mese.</p>
                  : <>
                    {emesseMese.map(f => (
                      <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div><div style={{ fontWeight:600, fontSize:13 }}>{f.cliente}</div><div style={{ fontSize:11, color:'var(--text-dim)' }}>{fmtDate(f.data)}</div></div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontWeight:700, color:'var(--green)' }}>{fmt(f.importo)}</span>
                          <button onClick={() => setSpostaModal({ tipo:'emessa_cons', item:f, nuovaData:f.data||'' })} title="Sposta" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--teal)', fontSize:14 }}>📅</button>
                          <button onClick={() => annullaEmessa(f.id, f.progettoId)} title="Annulla" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', fontSize:18, lineHeight:1 }}>↩</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'2px solid var(--border)', fontWeight:700 }}>
                      <span>Totale emesso</span>
                      <span style={{ color:'var(--green)' }}>{fmt(emesseMese.reduce((a,f)=>a+(parseFloat(f.importo)||0),0))}</span>
                    </div>
                  </>
                }
              </>
            ) : (
              <>
                <div className="card-title">📤 Fatture da Emettere ai Clienti</div>
                {pendentiClienti.length === 0
                  ? <p style={{ fontSize:13, color:'var(--green)' }}>✓ Tutte le fatture sono state emesse.</p>
                  : <div className="table-wrap">
                      <table>
                        <thead><tr><th>Cliente</th><th>Tipo</th><th className="text-right">Imponibile</th><th className="text-right">Con IVA</th><th></th></tr></thead>
                        <tbody>
                          {pendentiClienti.map((r, i) => (
                            <tr key={i}>
                              <td className="fw-500" style={{ fontSize:13 }}>
                                {r.cliente}
                                {r.spostata && <BadgeSpostata meseOrig={null} />}
                                {r.desc && <span style={{ fontSize:11, color:'var(--teal-d)', marginLeft:4 }}>{r.desc}</span>}
                              </td>
                              <td><span className={`badge ${r.tipo==='spot'?'badge-blue':'badge-gold'}`}>{r.tipo==='spot'?'Spot':'Mensile'}</span></td>
                              <td className="text-right text-gold">{fmt(r.importo)}</td>
                              <td className="text-right">{fmt(r.importo*1.22)}</td>
                              <td>
                                <div style={{ display:'flex', gap:6 }}>
                                  <button onClick={() => setSpostaModal({ tipo:'bdg_emessa', item:r, nuovaData:'' })} style={{ background:'rgba(82,161,163,.1)', color:'var(--teal-d)', border:'1px solid rgba(82,161,163,.3)', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>📅 Sposta</button>
                                  <button onClick={() => segnaEmessa(r)} style={{ background:'rgba(45,122,58,0.1)', color:'var(--green)', border:'1px solid rgba(45,122,58,0.3)', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>✓ Emessa</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background:'rgba(160,120,64,0.05)' }}>
                            <td colSpan={2} className="fw-500">TOTALE</td>
                            <td className="text-right text-gold fw-500">{fmt(pendentiClienti.reduce((a,r)=>a+r.importo,0))}</td>
                            <td className="text-right fw-500">{fmt(pendentiClienti.reduce((a,r)=>a+r.importo*1.22,0))}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                }
              </>
            )}
          </div>

          {/* PROFESSIONISTI */}
          <div className="card">
            {vista === 'cons' ? (
              <>
                <div className="card-title" style={{ color:'var(--red)' }}>✓ Fatture Ricevute – {MESI[mese-1]}</div>
                {ricevuteMese.length === 0
                  ? <p style={{ fontSize:13, color:'var(--text-muted)' }}>Nessuna fattura ricevuta questo mese.</p>
                  : <>
                    {ricevuteMese.map(f => (
                      <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div><div style={{ fontWeight:600, fontSize:13 }}>{f.profNome}</div><div style={{ fontSize:11, color:'var(--text-dim)' }}>{f.voceDes} · {fmtDate(f.data)}</div></div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontWeight:700, color:'var(--red)' }}>{fmt(f.importo)}</span>
                          <button onClick={() => annullaRicevuta(f)} title="Annulla" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', fontSize:18, lineHeight:1 }}>↩</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'2px solid var(--border)', fontWeight:700 }}>
                      <span>Totale ricevuto</span>
                      <span style={{ color:'var(--red)' }}>{fmt(ricevuteMese.reduce((a,f)=>a+(parseFloat(f.importo)||0),0))}</span>
                    </div>
                  </>
                }
              </>
            ) : (
              <>
                <div className="card-title">📥 Fatture da Ricevere dai Professionisti</div>
                {pendentiProf.length === 0
                  ? <p style={{ fontSize:13, color:'var(--green)' }}>✓ Tutte le fatture sono state ricevute.</p>
                  : pendentiProf.map(({ prof, entries }) => {
                      const pendenti = entries.filter(e => !isRicevuta(e.key))
                      if (pendenti.length === 0) return null
                      return (
                        <div key={prof.id} style={{ marginBottom:16, paddingBottom:12, borderBottom:'1px solid var(--border)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                            <div>
                              <div className="fw-500">{prof.nome} <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:400 }}>{prof.ruolo}</span></div>
                              {prof.piva ? <span className="piva-tag">P.IVA {prof.piva}</span> : <span className="piva-missing">⚠ P.IVA mancante</span>}
                            </div>
                            <span className="badge badge-red">{fmt(pendenti.reduce((a,e)=>a+e.importo,0))}</span>
                          </div>
                          {pendenti.map((e, ei) => (
                            <div key={ei} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(46,44,41,0.08)' }}>
                              <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                                {e.fisso ? '🔒 ' : ''}{e.desc}
                                {e.spostata && <BadgeSpostata meseOrig={e.meseOrig} />}
                              </span>
                              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                                <span style={{ fontSize:12, fontWeight:500 }}>{fmt(e.importo)}</span>
                                <button onClick={() => setSpostaModal({ tipo:'bdg_ricevuta', item:{...e, prof}, nuovaData:'' })} style={{ background:'rgba(82,161,163,.1)', color:'var(--teal-d)', border:'1px solid rgba(82,161,163,.3)', borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>📅</button>
                                <button onClick={() => segnaRicevuta(e, prof)} style={{ background:'rgba(192,57,43,0.1)', color:'var(--red)', border:'1px solid rgba(192,57,43,0.3)', borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>✓ Ricevuta</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })
                }
              </>
            )}
          </div>
        </div>

        {/* Costi Fissi */}
        {cfMese.length > 0 && (
          <div className="card" style={{ marginBottom:20 }}>
            <div className="card-title">◆ Scadenze Costi Fissi – {MESI[mese-1]}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:0, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
              {cfMese.map(({ cf, importo }, i) => {
                const iva = parseFloat(cf.iva) || 0
                const oggi = new Date()
                const isCurrentMonth = anno === oggi.getFullYear() && mese === oggi.getMonth() + 1
                const g = cf.giorno || null
                let urgColor = 'var(--text-muted)', urgLabel = g ? `${g} ${MESI[mese-1].slice(0,3)}` : 'data aperta'
                if (isCurrentMonth && g) {
                  const diff = g - oggi.getDate()
                  if (diff < 0) { urgColor = 'var(--text-dim)'; urgLabel = 'Già passato' }
                  else if (diff === 0) { urgColor = 'var(--red)'; urgLabel = 'OGGI' }
                  else if (diff <= 3) { urgColor = 'var(--red)'; urgLabel = `fra ${diff}gg` }
                  else if (diff <= 7) { urgColor = 'var(--gold)'; urgLabel = `fra ${diff}gg` }
                }
                const chiave = `${anno}-${mese}`
                const pagato = (cf.mesiPagati || []).includes(chiave)
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i < cfMese.length-1 ? '1px solid var(--border)' : 'none', background: pagato ? 'rgba(45,122,58,.05)' : i%2===0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <div style={{ width:36, textAlign:'center', flexShrink:0 }}>
                      <div style={{ fontSize:16, fontWeight:700, color:urgColor }}>{g||'—'}</div>
                      <div style={{ fontSize:9, color:urgColor, textTransform:'uppercase' }}>{urgLabel}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:500, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                        {cf.descrizione}
                        {pagato && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(45,122,58,.15)', color:'var(--green)', fontWeight:700 }}>✓ PAGATA</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>{cf.fornitore} · <span className="badge badge-purple" style={{ fontSize:10 }}>{cf.categoria}</span></div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0, marginRight:8 }}>
                      <div style={{ color:'var(--purple)', fontWeight:500 }}>{fmt(importo)}</div>
                      <div style={{ fontSize:11, color:'var(--text-dim)' }}>+ IVA {iva}% = {fmt(applyIva(importo,iva))}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button onClick={() => setSpostaModal({ tipo:'cf', item:cf, nuovaData:'' })} style={{ padding:'4px 8px', background:'rgba(82,161,163,.1)', color:'var(--teal-d)', border:'1px solid rgba(82,161,163,.3)', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>📅 Sposta</button>
                      {pagato
                        ? <button onClick={() => annullaPagamento(cf)} style={{ padding:'4px 8px', background:'rgba(192,57,43,.1)', color:'var(--red)', border:'1px solid rgba(192,57,43,.3)', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>↩ Annulla</button>
                        : <button onClick={() => pagaCostoFisso(cf)} style={{ padding:'4px 8px', background:'rgba(45,122,58,.1)', color:'var(--green)', border:'1px solid rgba(45,122,58,.3)', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>✓ Pagata</button>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12, fontSize:13, fontWeight:500 }}>
              Totale con IVA: <span style={{ color:'var(--purple)', marginLeft:8 }}>{fmt(cfMese.reduce((a,{cf,importo})=>a+applyIva(importo,parseFloat(cf.iva)||0),0))}</span>
            </div>
          </div>
        )}

        <div className={`margine-box${mg<0?' negativo':''}`} style={{ marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <span style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, fontWeight:500, color:mg>=0?'var(--green)':'var(--red)' }}>
              Margine {MESI[mese-1]}: {fmt(mg)}
            </span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {fmt(totF)} − {fmt(totCOp)} − {fmt(totCF)} = <strong style={{ color:mg>=0?'var(--green)':'var(--red)' }}>{fmt(mg)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Modale Sposta */}
      {spostaModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, backdropFilter:'blur(4px)' }}
          onClick={e => { if(e.target===e.currentTarget) setSpostaModal(null) }}>
          <div style={{ background:'var(--cream)', border:'1px solid var(--line)', borderRadius:16, padding:28, width:360, boxShadow:'0 8px 32px rgba(0,0,0,.15)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:14, fontWeight:800, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>📅 Sposta a nuova data</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:4 }}>
              {spostaModal.tipo === 'cf' ? spostaModal.item.descrizione : spostaModal.item.cliente || spostaModal.item.prof?.nome || spostaModal.item.desc || ''}
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
              Mese corrente: <strong>{MESI[mese-1]} {anno}</strong>
            </div>
            <input type="date" style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--line)', borderRadius:8, fontSize:14, marginBottom:16, boxSizing:'border-box' }}
              value={spostaModal.nuovaData}
              onChange={e => setSpostaModal(s => ({ ...s, nuovaData: e.target.value }))} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setSpostaModal(null)} style={{ padding:'8px 16px', background:'#fff', border:'1.5px solid var(--line)', borderRadius:8, cursor:'pointer', fontSize:13 }}>Annulla</button>
              <button
                disabled={!spostaModal.nuovaData}
                onClick={() => {
                  if (!spostaModal.nuovaData) return
                  if (spostaModal.tipo === 'cf') spostaCostoFisso(spostaModal.item, spostaModal.nuovaData)
                  else spostaVoce(spostaModal.tipo, spostaModal.item, spostaModal.nuovaData)
                }}
                style={{ padding:'8px 20px', background: spostaModal.nuovaData ? 'var(--ink)' : '#ccc', color:'#fff', border:'none', borderRadius:8, cursor: spostaModal.nuovaData ? 'pointer' : 'not-allowed', fontSize:13, fontWeight:700 }}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
