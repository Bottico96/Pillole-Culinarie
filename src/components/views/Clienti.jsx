import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, MESI, fatturatoCliente, costoOperatoreMese } from '../../lib/calc'
import { FieldError, ValidationSummary, useConfirm } from '../ui/FormComponents'

const ANNI = [2025, 2026, 2027]

export default function Clienti() {
  const { clienti: _clienti, progetti: _progetti, professionisti: _professionisti, loading } = useData()
  const clienti = _clienti || []
  const progetti = _progetti || []
  const professionisti = _professionisti || []
  const { confirm, ConfirmModal } = useConfirm()
  const [annoStats, setAnnoStats] = useState(2026)
  const [clienteSelezionato, setClienteSelezionato] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errori, setErrori] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})

  const emptyForm = {
    nome: '', ragioneSociale: '', piva: '', codiceFiscale: '',
    indirizzo: '', cap: '', citta: '', email: '', telefono: '', note: ''
  }
  const [form, setForm] = useState(emptyForm)

  // Raggruppa progetti per cliente (usando il campo cliente del progetto)
  const clientiConProgetti = useMemo(() => {
    // Fonte di verità: collezione clienti Firestore
    const daFirestore = clienti.map(c => {
      const progettiCliente = progetti.filter(p =>
        p.cliente?.toLowerCase() === c.nome?.toLowerCase() ||
        p.cliente?.toLowerCase() === c.ragioneSociale?.toLowerCase()
      )
      let totFat = 0, totCosti = 0
      progettiCliente.forEach(p => {
        for (let m = 1; m <= 12; m++) {
          totFat += fatturatoCliente(p, annoStats, m)
          ;(p.costi || []).forEach(cc => { totCosti += costoOperatoreMese(cc, p, annoStats, m) })
        }
      })
      return {
        id: c.id, nome: c.nome || '', ragioneSociale: c.ragioneSociale || '',
        piva: c.piva || '', codiceFiscale: c.codiceFiscale || '',
        indirizzo: c.indirizzo || '', cap: c.cap || '', citta: c.citta || '',
        email: c.email || '', telefono: c.telefono || '', note: c.note || '',
        progetti: progettiCliente, totFat, totCosti, margine: totFat - totCosti,
      }
    })

    // Clienti orfani: in progetti ma non ancora in Firestore
    const nomiFirestore = new Set(clienti.map(c => c.nome?.toLowerCase()).filter(Boolean))
    const orfani = [...new Set(progetti.map(p => p.cliente).filter(Boolean))]
      .filter(nome => !nomiFirestore.has(nome.toLowerCase()))
      .map(nomeCliente => {
        const progettiCliente = progetti.filter(p =>
          p.cliente?.toLowerCase() === nomeCliente.toLowerCase()
        )
        let totFat = 0, totCosti = 0
        progettiCliente.forEach(p => {
          for (let m = 1; m <= 12; m++) {
            totFat += fatturatoCliente(p, annoStats, m)
            ;(p.costi || []).forEach(cc => { totCosti += costoOperatoreMese(cc, p, annoStats, m) })
          }
        })
        return {
          id: null, nome: nomeCliente, ragioneSociale: '', piva: '', codiceFiscale: '',
          indirizzo: '', cap: '', citta: '', email: '', telefono: '', note: '',
          progetti: progettiCliente, totFat, totCosti, margine: totFat - totCosti,
        }
      })

    return [...daFirestore, ...orfani].sort((a, b) => b.totFat - a.totFat)
  }, [clienti, progetti, annoStats])

  const totFatTotale = clientiConProgetti.reduce((a, c) => a + c.totFat, 0)

  const valida = () => {
    const fe = {}, errs = []
    if (!form.nome?.trim()) { fe.nome = 'Nome obbligatorio.'; errs.push(fe.nome) }
    if (form.piva && !/^\d{11}$|^IT\d{11}$/i.test(form.piva.replace(/\s/g, ''))) {
      fe.piva = 'P.IVA non valida (es. IT12345678901).'; errs.push(fe.piva)
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      fe.email = 'Email non valida.'; errs.push(fe.email)
    }
    setFieldErrors(fe); setErrori(errs)
    return errs.length === 0
  }

  const openNew = () => {
    setEditingId(null); setForm(emptyForm); setErrori([]); setFieldErrors({})
    setShowModal(true)
  }

  const openEdit = (c) => {
    setEditingId(c.id)
    setForm({
      nome: c.nome || '', ragioneSociale: c.ragioneSociale || '',
      piva: c.piva || '', codiceFiscale: c.codiceFiscale || '',
      indirizzo: c.indirizzo || '', cap: c.cap || '', citta: c.citta || '',
      email: c.email || '', telefono: c.telefono || '', note: c.note || ''
    })
    setErrori([]); setFieldErrors({}); setShowModal(true)
  }

  const salva = async () => {
    if (!valida()) return
    setSaving(true)
    if (editingId) await updateItem(cols.clienti, editingId, form)
    else await addItem(cols.clienti, form)
    setSaving(false); setShowModal(false); setForm(emptyForm); setEditingId(null)
  }

  const elimina = async (c) => {
    if (c.progetti.length > 0) {
      alert(`Non puoi eliminare ${c.nome}: ha ${c.progetti.length} progetto/i collegati.`)
      return
    }
    const ok = await confirm(`Eliminare ${c.nome}?`, 'Questa operazione non può essere annullata.')
    if (!ok) return
    if (c.id) await deleteItem(cols.clienti, c.id)
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  // Vista scheda cliente
  if (clienteSelezionato) {
    const c = clientiConProgetti.find(x => x.nome === clienteSelezionato)
    if (!c) { setClienteSelezionato(null); return null }

    const mesiGrafico = Array.from({ length: 12 }, (_, i) => {
      let tot = 0
      c.progetti.forEach(p => { tot += fatturatoCliente(p, annoStats, i + 1) })
      return tot
    })
    const maxGraf = Math.max(...mesiGrafico, 1)

    return (
      <>
        <ConfirmModal />
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setClienteSelezionato(null)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
              ← Clienti
            </button>
            <div>
              <div className="page-title">{c.nome}</div>
              <div className="page-sub">{c.ragioneSociale || 'Scheda cliente'}</div>
            </div>
          </div>
          <div className="header-actions">
            <select value={annoStats} onChange={e => setAnnoStats(parseInt(e.target.value))} style={{ width: 100 }}>
              {ANNI.map(a => <option key={a}>{a}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={() => openEdit(c)}>✎ Modifica dati</button>
          </div>
        </div>

        <div className="content">
          {/* Dati fiscali */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-title">📋 Dati per la Fatturazione</div>
              {c.piva || c.ragioneSociale || c.indirizzo
                ? (
                  <div style={{ fontSize: 13, lineHeight: 2 }}>
                    {c.ragioneSociale && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Ragione Sociale</span><br /><strong>{c.ragioneSociale}</strong></div>}
                    {c.piva && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>P.IVA</span><br /><span className="piva-tag">{c.piva}</span></div>}
                    {c.codiceFiscale && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Codice Fiscale</span><br />{c.codiceFiscale}</div>}
                    {c.indirizzo && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Indirizzo</span><br />{c.indirizzo}{c.cap ? ', ' + c.cap : ''}{c.citta ? ' ' + c.citta : ''}</div>}
                    {c.email && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Email</span><br /><a href={`mailto:${c.email}`} style={{ color: 'var(--gold)' }}>{c.email}</a></div>}
                    {c.telefono && <div><span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Telefono</span><br />{c.telefono}</div>}
                  </div>
                )
                : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Nessun dato fiscale inserito.
                    <br /><button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => openEdit(c)}>＋ Aggiungi dati</button>
                  </div>
                )
              }
            </div>

            <div className="card">
              <div className="card-title">📊 Performance {annoStats}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  ['Fatturato', c.totFat, 'var(--gold)'],
                  ['Costi Operatori', c.totCosti, 'var(--red)'],
                  ['Margine', c.margine, c.margine >= 0 ? 'var(--green)' : 'var(--red)'],
                  ['Margine %', c.totFat > 0 ? Math.round(c.margine / c.totFat * 100) + '%' : '—', c.margine >= 0 ? 'var(--green)' : 'var(--red)'],
                ].map(([lab, val, col]) => (
                  <div key={lab} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{lab}</div>
                    <div style={{ fontSize: 16, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, color: col }}>
                      {typeof val === 'number' ? fmt(val) : val}
                    </div>
                  </div>
                ))}
              </div>
              {/* Grafico mensile */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
                {mesiGrafico.map((v, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: '100%', background: v > 0 ? 'var(--gold)' : 'var(--surface2)', borderRadius: '2px 2px 0 0', height: Math.max(v / maxGraf * 50, v > 0 ? 2 : 0), opacity: 0.8 }} />
                    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{MESI[i].slice(0, 1)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Progetti */}
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', fontWeight: 600, marginBottom: 12 }}>
            Progetti ({c.progetti.length})
          </div>

          {c.progetti.length === 0
            ? <div className="empty-state"><div className="icon">◻</div><p>Nessun progetto per questo cliente.</p></div>
            : c.progetti.map(p => {
              let totFat = 0, totCosti = 0
              for (let m = 1; m <= 12; m++) {
                totFat += fatturatoCliente(p, annoStats, m)
                ;(p.costi || []).forEach(cc => { totCosti += costoOperatoreMese(cc, p, annoStats, m) })
              }
              const margine = totFat - totCosti
              const mgPct = totFat > 0 ? Math.round(margine / totFat * 100) : 0

              return (
                <div key={p.id} className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, fontWeight: 600 }}>{p.nome}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span className={`badge ${p.tipo === 'ricorrente' ? 'badge-gold' : 'badge-blue'}`}>
                          {p.tipo === 'ricorrente' ? '↻ Ricorrente' : '⬡ Spot'}
                        </span>
                        {p.tipo === 'ricorrente' && <span className="badge badge-purple">{fmt(p.importo)}/mese × {p.durata} mesi</span>}
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>da {MESI[(parseInt(p.meseInizio) || 1) - 1]} {p.annoInizio}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: 14, background: 'var(--surface2)', borderRadius: 8, marginBottom: p.scadenze?.length > 0 || p.costi?.length > 0 ? 14 : 0 }}>
                    {[['Fatturato', totFat, 'var(--gold)'], ['Costi', totCosti, 'var(--red)'], [`Margine (${mgPct}%)`, margine, margine >= 0 ? 'var(--green)' : 'var(--red)']].map(([lab, val, col]) => (
                      <div key={lab}><div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{lab}</div><div style={{ fontSize: 17, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, color: col }}>{fmt(val)}</div></div>
                    ))}
                  </div>

                  {p.tipo === 'spot' && p.scadenze?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>Scadenze</div>
                      {p.scadenze.map((sc, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                          <span className="text-muted">{sc.desc || '—'}</span>
                          <div style={{ display: 'flex', gap: 16 }}>
                            <span style={{ color: 'var(--text-dim)' }}>{sc.data}</span>
                            <span className="text-gold fw-500">{fmt(parseFloat(sc.importo))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.costi?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>Costi Operatori</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.costi.map((c, i) => {
                          const prof = professionisti.find(pr => pr.id === c.profId)
                          return <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}><span className="fw-500">{prof?.nome || 'N/D'}</span><span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{fmt(c.importo)}{c.tipo === 'mensile' ? '/mese' : ' una tantum'}</span></div>
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          }
        </div>

        {/* Modal modifica dati cliente */}
        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal" style={{ maxWidth: 620 }}>
              <div className="modal-header">
                <span className="modal-title">Dati Fiscali — {form.nome || c.nome}</span>
                <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:20, cursor:'pointer' }}>✕</button>
              </div>
              <div className="modal-body">
              <ValidationSummary errors={errori} />
              <div className="form-row">
                <div className="form-group"><label>Nome cliente *</label><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={fieldErrors.nome ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.nome} /></div>
                <div className="form-group"><label>Ragione Sociale</label><input value={form.ragioneSociale} onChange={e => setForm(f => ({ ...f, ragioneSociale: e.target.value }))} placeholder="es. LOVE & PASSION Srl" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>P.IVA</label><input value={form.piva} onChange={e => setForm(f => ({ ...f, piva: e.target.value.trim().toUpperCase() }))} placeholder="IT12345678901" style={fieldErrors.piva ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.piva} /></div>
                <div className="form-group"><label>Codice Fiscale</label><input value={form.codiceFiscale} onChange={e => setForm(f => ({ ...f, codiceFiscale: e.target.value.trim().toUpperCase() }))} /></div>
              </div>
              <div className="form-group"><label>Indirizzo</label><input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} placeholder="Via Roma 1" /></div>
              <div className="form-row">
                <div className="form-group"><label>CAP</label><input value={form.cap} onChange={e => setForm(f => ({ ...f, cap: e.target.value }))} placeholder="20100" /></div>
                <div className="form-group"><label>Città</label><input value={form.citta} onChange={e => setForm(f => ({ ...f, citta: e.target.value }))} placeholder="Milano" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={fieldErrors.email ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.email} /></div>
                <div className="form-group"><label>Telefono</label><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annulla</button>
                <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Vista lista clienti
  return (
    <>
      <ConfirmModal />
      <div className="page-header">
        <div className="page-title">Clienti</div>
        <div className="page-sub">Anagrafica clienti e fatturato per cliente</div>
        <div className="header-actions">
          <select value={annoStats} onChange={e => setAnnoStats(parseInt(e.target.value))} style={{ width: 100 }}>
            {ANNI.map(a => <option key={a}>{a}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuovo Cliente</button>
        </div>
      </div>

      <div className="content">
        {/* Stats globali */}
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card gold"><div className="stat-label">Fatturato totale {annoStats}</div><div className="stat-value">{fmt(totFatTotale)}</div><div className="stat-note">{clientiConProgetti.length} clienti attivi</div></div>
          <div className="stat-card green"><div className="stat-label">Margine complessivo</div><div className="stat-value">{fmt(clientiConProgetti.reduce((a, c) => a + c.margine, 0))}</div><div className="stat-note">{totFatTotale > 0 ? Math.round(clientiConProgetti.reduce((a, c) => a + c.margine, 0) / totFatTotale * 100) : 0}% del fatturato</div></div>
          <div className="stat-card purple"><div className="stat-label">Progetti totali</div><div className="stat-value">{clientiConProgetti.reduce((a, c) => a + c.progetti.length, 0)}</div><div className="stat-note">Su tutti i clienti</div></div>
        </div>

        {/* Lista clienti */}
        {clientiConProgetti.length === 0
          ? <div className="empty-state"><div className="icon">◉</div><p>Nessun cliente trovato.</p></div>
          : clientiConProgetti.map(c => {
            const mgPct = c.totFat > 0 ? Math.round(c.margine / c.totFat * 100) : 0
            const hasDati = c.piva || c.email || c.ragioneSociale

            return (
              <div key={c.nome} className="card" style={{ marginBottom: 14, cursor: 'pointer' }}
                onClick={() => setClienteSelezionato(c.nome)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 600 }}>{c.nome}</div>
                      {!hasDati && <span className="piva-missing" style={{ fontSize: 10 }}>⚠ Dati fiscali mancanti</span>}
                    </div>
                    {c.ragioneSociale && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.ragioneSociale}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {c.piva && <span className="piva-tag">{c.piva}</span>}
                      {c.citta && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>📍 {c.citta}</span>}
                      {c.email && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>✉ {c.email}</span>}
                      <span className="badge badge-gold">{c.progetti.length} progetto/i</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 2 }}>Fatturato {annoStats}</div>
                      <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, color: 'var(--gold)' }}>{fmt(c.totFat)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 2 }}>Margine</div>
                      <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, color: c.margine >= 0 ? 'var(--green)' : 'var(--red)' }}>{mgPct}%</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✎</button>
                      {c.id && <button className="btn btn-danger btn-sm" onClick={() => elimina(c)}>✕</button>}
                    </div>
                  </div>
                </div>

                {/* Barra fatturato */}
                <div style={{ marginTop: 14 }}>
                  <div className="progress-bar">
                    <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 3, width: `${totFatTotale > 0 ? c.totFat / totFatTotale * 100 : 0}%`, opacity: 0.7, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textAlign: 'right' }}>
                    {totFatTotale > 0 ? Math.round(c.totFat / totFatTotale * 100) : 0}% del fatturato totale
                  </div>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Modal nuovo cliente */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <span className="modal-title">Nuovo Cliente</span>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div className="modal-body">
            <ValidationSummary errors={errori} />
            <div className="form-row">
              <div className="form-group"><label>Nome cliente * <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(deve corrispondere al campo Cliente nei Progetti)</span></label><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="es. LOVE & PASSION Srl" style={fieldErrors.nome ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.nome} /></div>
              <div className="form-group"><label>Ragione Sociale</label><input value={form.ragioneSociale} onChange={e => setForm(f => ({ ...f, ragioneSociale: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>P.IVA</label><input value={form.piva} onChange={e => setForm(f => ({ ...f, piva: e.target.value.trim().toUpperCase() }))} placeholder="IT12345678901" style={fieldErrors.piva ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.piva} /></div>
              <div className="form-group"><label>Codice Fiscale</label><input value={form.codiceFiscale} onChange={e => setForm(f => ({ ...f, codiceFiscale: e.target.value.trim().toUpperCase() }))} /></div>
            </div>
            <div className="form-group"><label>Indirizzo</label><input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} placeholder="Via Roma 1" /></div>
            <div className="form-row">
              <div className="form-group"><label>CAP</label><input value={form.cap} onChange={e => setForm(f => ({ ...f, cap: e.target.value }))} /></div>
              <div className="form-group"><label>Città</label><input value={form.citta} onChange={e => setForm(f => ({ ...f, citta: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={fieldErrors.email ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.email} /></div>
              <div className="form-group"><label>Telefono</label><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
