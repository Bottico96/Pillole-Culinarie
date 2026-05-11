import { useState, useMemo, useEffect, useCallback } from 'react'
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
         serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { accettaPreventivo, addItem, cols } from '../../lib/db'
import { useData } from '../../hooks/useData'

/* ── Calcolo ─────────────────────────────────────────────────── */
function prevCompute(p) {
  let costoTot = 0
  ;(p.righe || []).forEach(r => {
    const cn = parseFloat(r.costoNetto) || 0
    const imposte = cn * 0.04 + 2
    costoTot += (cn + imposte) * (parseFloat(r.output) || 1)
  })
  const molt = parseFloat(p.moltiplicatore) || 0.63
  const prezzoAuto = molt > 0 ? costoTot / molt : 0
  const prezzoNetto = parseFloat(p.prezzoOverride) > 0 ? parseFloat(p.prezzoOverride) : prezzoAuto
  const iva = prezzoNetto * 0.22
  const margine = prezzoNetto - costoTot
  const marginePerc = prezzoNetto > 0 ? (margine / prezzoNetto) * 100 : 0
  return { costoTot, prezzoAuto, prezzoNetto, iva, totaleLordo: prezzoNetto + iva, margine, marginePerc }
}

const fmt = n => isNaN(n) ? '—' : '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const ANNI = [2024,2025,2026,2027,2028]

const STATI = ['Da Inviare Preventivo','Preventivo Inviato','Da Contrattualizzare','Contrattualizzato','Rifiutato','Non Confermato']
const STATO_STYLE = {
  'Da Inviare Preventivo': { bg:'#FCE5D4', color:'#8a4a26' },
  'Preventivo Inviato':    { bg:'#FDF1CB', color:'#8a6a1c' },
  'Da Contrattualizzare':  { bg:'#D4ECE5', color:'#1f5a4a' },
  'Contrattualizzato':     { bg:'#52A1A3', color:'#fff' },
  'Rifiutato':             { bg:'#FCD9DD', color:'#B01D3D' },
  'Non Confermato':        { bg:'#f0f0f0', color:'#666' },
}

/* ── Styles ──────────────────────────────────────────────────── */
const S = {
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:100, padding:'24px 16px', overflowY:'auto', backdropFilter:'blur(4px)' },
  modal: { background:'var(--cream)', border:'1px solid var(--line)', borderRadius:16, width:'100%', maxWidth:780, display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,.12)' },
  modalHeader: { background:'var(--ink)', padding:'16px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  modalTitle: { fontFamily:'var(--font-head)', fontSize:14, fontWeight:800, textTransform:'uppercase', letterSpacing:'.5px', color:'#fff' },
  modalBody: { padding:'24px', overflowY:'auto', flex:1 },
  modalFooter: { padding:'16px 24px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', borderRadius:'0 0 16px 16px', gap:10 },
  closeBtn: { background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:20, cursor:'pointer', lineHeight:1, padding:'2px 6px', borderRadius:4 },
  label: { display:'block', fontSize:12, color:'var(--muted)', marginBottom:6, fontWeight:600, letterSpacing:'.3px' },
  input: { width:'100%', background:'#fff', border:'1.5px solid var(--line)', borderRadius:8, padding:'10px 12px', color:'var(--ink)', fontFamily:'var(--font-body)', fontSize:13, outline:'none', transition:'border-color .15s, box-shadow .15s' },
  group: { marginBottom:18 },
  row2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  row3: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  calcBox: { background:'var(--cream-d)', borderRadius:10, padding:16, marginTop:4 },
  stepDot: (active, done) => ({ width:28, height:28, borderRadius:'50%', background: done ? 'var(--teal)' : active ? 'var(--ink)' : 'var(--line)', color: (active||done) ? '#fff' : 'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }),
}

function inputStyle(focused) {
  return { ...S.input, borderColor: focused ? 'var(--teal)' : 'var(--line)', boxShadow: focused ? '0 0 0 3px rgba(82,161,163,.15)' : 'none' }
}

/* ── Hooks ───────────────────────────────────────────────────── */
function usePreventivi() {
  const [list, setList] = useState([])
  useEffect(() => {
    return onSnapshot(collection(db, 'preventivi'), snap => 
      setList(snap.docs.map(d => ({ _fsId: d.id, ...d.data() })))
    )
  }, [])
  return list
}

function useServizi() {
  const [list, setList] = useState([])
  useEffect(() => onSnapshot(collection(db, 'servizi'), snap => setList(snap.docs.map(d => ({ _fsId: d.id, ...d.data() })))), [])
  return list
}

/* ══════════════════════════════════════════════════════════════
   MODAL PREVENTIVO
══════════════════════════════════════════════════════════════ */
function PrevModal({ preventivo, clienti, servizi, onClose, onSave }) {
  const isNew = !preventivo
  const [form, setForm] = useState(() => {
    if (preventivo) return {
      ...preventivo,
      righe: (preventivo.righe || []).map(r => ({ ...r, _k: Math.random().toString(36).slice(2) }))
    }
    return {
      progetto:'', data: today(), scadenza:'', clienteId:'', clienteNome:'',
      stato:'Da Inviare Preventivo', accettato:'in attesa',
      tipoContratto:'ricorrente', meseInizio: new Date().getMonth()+1,
      annoInizio: 2026, durata:12, modalitaFatturazione:'consuntivo',
      moltiplicatore:0.63, prezzoOverride:'', note:'', righe:[]
    }
  })
  const [nuovoCliente, setNuovoCliente] = useState(false)
  const [nomeNuovoCliente, setNomeNuovoCliente] = useState('')
  const [focused, setFocused] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const calc = useMemo(() => prevCompute(form), [form])

  const centri = useMemo(() => [...new Set(servizi.map(s => s.centroCosto).filter(Boolean))].sort(), [servizi])
  const svcsPerCentro = useCallback(cc => servizi.filter(s => s.centroCosto === cc), [servizi])

  function addRiga() {
    const r = { _k: Math.random().toString(36).slice(2), centroCosto: centri[0]||'', servizioId:'', servizio:'', operatore:'', costoNetto:'', output:1, mesi:1, tipologia:'Costo Variabile' }
    const svcs = svcsPerCentro(r.centroCosto)
    if (svcs.length) { r.servizioId = svcs[0]._fsId; r.servizio = svcs[0].nome; r.costoNetto = svcs[0].costoNetto || '' }
    setForm(f => ({ ...f, righe: [...f.righe, r] }))
  }

  function updateRiga(k, patch) {
    setForm(f => ({
      ...f,
      righe: f.righe.map(r => {
        if (r._k !== k) return r
        const u = { ...r, ...patch }
        if (patch.centroCosto) {
          const svcs = svcsPerCentro(patch.centroCosto)
          if (svcs.length) { u.servizioId = svcs[0]._fsId; u.servizio = svcs[0].nome; u.costoNetto = svcs[0].costoNetto || '' }
        }
        if (patch.servizioId) {
          const s = servizi.find(x => x._fsId === patch.servizioId)
          if (s) { u.servizio = s.nome; u.costoNetto = s.costoNetto || ''; u.operatore = u.operatore || s.ruoloOperatore || '' }
        }
        return u
      })
    }))
  }

  async function handleSave() {
    if (!form.progetto.trim()) { alert('Inserisci il nome del progetto'); return }
    if (!form.clienteId && !nomeNuovoCliente.trim()) { alert('Seleziona o crea un cliente'); return }
    setSaving(true)

    let finalClienteId = form.clienteId
    let finalClienteNome = form.clienteNome

    if (nuovoCliente && nomeNuovoCliente.trim()) {
      finalClienteNome = nomeNuovoCliente.trim()
      finalClienteId = await addItem(cols.clienti, { nome: finalClienteNome, ragioneSociale:'', piva:'', email:'', telefono:'' })
    }

    const clean = {
      ...form,
      clienteId: finalClienteId,
      clienteNome: finalClienteNome,
      moltiplicatore: parseFloat(form.moltiplicatore) || 0.63,
      prezzoOverride: parseFloat(form.prezzoOverride) || null,
      righe: form.righe.map(({ _k, ...r }) => r),
    }
    await onSave(clean)
    setSaving(false)
    onClose()
  }

  const statoStyle = STATO_STYLE[form.stato] || {}

  return (
    <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>{isNew ? 'Nuovo Preventivo' : `Modifica ${form.progetto || ''}`}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.modalBody}>
          {/* Dati base */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div style={S.group}>
              <label style={S.label}>Nome progetto *</label>
              <input style={inputStyle(focused.progetto)} value={form.progetto}
                onChange={e => set('progetto', e.target.value)}
                onFocus={() => setFocused(f=>({...f,progetto:true}))}
                onBlur={() => setFocused(f=>({...f,progetto:false}))}
                placeholder="es. Gestione Social 2026" />
            </div>

            <div style={S.group}>
              <label style={S.label}>Cliente *</label>
              {!nuovoCliente ? (
                <div style={{ display:'flex', gap:8 }}>
                  <select style={{ ...inputStyle(focused.cliente), flex:1 }}
                    value={form.clienteId}
                    onChange={e => {
                      const c = clienti.find(x => x.id === e.target.value)
                      set('clienteId', e.target.value)
                      set('clienteNome', c?.nome || '')
                    }}
                    onFocus={() => setFocused(f=>({...f,cliente:true}))}
                    onBlur={() => setFocused(f=>({...f,cliente:false}))}
                  >
                    <option value="">— Seleziona —</option>
                    {[...clienti].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <button onClick={() => setNuovoCliente(true)}
                    style={{ padding:'10px 12px', background:'var(--ink)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>
                    + Nuovo
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:8 }}>
                  <input style={{ ...inputStyle(focused.nuovoCliente), flex:1 }}
                    value={nomeNuovoCliente}
                    onChange={e => setNomeNuovoCliente(e.target.value)}
                    onFocus={() => setFocused(f=>({...f,nuovoCliente:true}))}
                    onBlur={() => setFocused(f=>({...f,nuovoCliente:false}))}
                    placeholder="Nome cliente" />
                  <button onClick={() => { setNuovoCliente(false); setNomeNuovoCliente('') }}
                    style={{ padding:'10px 12px', background:'#fff', color:'var(--ink)', border:'1.5px solid var(--line)', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                    Lista
                  </button>
                </div>
              )}
            </div>

            <div style={S.group}>
              <label style={S.label}>Stato</label>
              <select style={{ ...inputStyle(focused.stato), color: statoStyle.color, background: statoStyle.bg || '#fff', fontWeight:600 }}
                value={form.stato}
                onChange={e => set('stato', e.target.value)}
                onFocus={() => setFocused(f=>({...f,stato:true}))}
                onBlur={() => setFocused(f=>({...f,stato:false}))}
              >
                {STATI.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={S.group}>
                <label style={S.label}>Data</label>
                <input type="date" style={inputStyle(focused.data)} value={form.data}
                  onChange={e => set('data', e.target.value)}
                  onFocus={() => setFocused(f=>({...f,data:true}))}
                  onBlur={() => setFocused(f=>({...f,data:false}))} />
              </div>
              <div style={S.group}>
                <label style={S.label}>Scadenza</label>
                <input type="date" style={inputStyle(focused.scadenza)} value={form.scadenza||''}
                  onChange={e => set('scadenza', e.target.value)}
                  onFocus={() => setFocused(f=>({...f,scadenza:true}))}
                  onBlur={() => setFocused(f=>({...f,scadenza:false}))} />
              </div>
            </div>
          </div>

          {/* Tipo contratto */}
          <div style={{ background:'#fff', border:'1.5px solid var(--line)', borderRadius:10, padding:16, marginBottom:20 }}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:14 }}>Tipo contratto</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
              <div style={S.group}>
                <label style={S.label}>Tipo</label>
                <select style={inputStyle(false)} value={form.tipoContratto} onChange={e => set('tipoContratto', e.target.value)}>
                  <option value="ricorrente">Ricorrente (mensile)</option>
                  <option value="spot">Una tantum (spot)</option>
                </select>
              </div>
              <div style={S.group}>
                <label style={S.label}>Mese inizio</label>
                <select style={inputStyle(false)} value={form.meseInizio} onChange={e => set('meseInizio', parseInt(e.target.value))}>
                  {MESI.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div style={S.group}>
                <label style={S.label}>Anno inizio</label>
                <select style={inputStyle(false)} value={form.annoInizio} onChange={e => set('annoInizio', parseInt(e.target.value))}>
                  {ANNI.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {form.tipoContratto === 'ricorrente' && (
                <div style={S.group}>
                  <label style={S.label}>Durata (mesi)</label>
                  <input type="number" min="1" max="120" style={inputStyle(false)}
                    value={form.durata} onChange={e => set('durata', parseInt(e.target.value)||12)} />
                </div>
              )}
              <div style={S.group}>
                <label style={S.label}>Modalità fatturazione</label>
                <select style={inputStyle(false)} value={form.modalitaFatturazione} onChange={e => set('modalitaFatturazione', e.target.value)}>
                  <option value="consuntivo">A consuntivo</option>
                  <option value="anticipata">Anticipata</option>
                  <option value="rate">A rate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Righe servizi */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontFamily:'var(--font-head)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px' }}>
                Servizi ({form.righe.length})
              </div>
              <button onClick={addRiga}
                style={{ padding:'7px 14px', background:'#fff', border:'1.5px solid var(--ink)', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.4px' }}>
                + Aggiungi
              </button>
            </div>

            {form.righe.length === 0 && (
              <div style={{ textAlign:'center', padding:'28px', color:'var(--text-dim)', border:'1.5px dashed var(--line)', borderRadius:10, fontSize:13 }}>
                Nessun servizio. Clicca "+ Aggiungi".
              </div>
            )}

            {form.righe.map(r => {
              const svcs = svcsPerCentro(r.centroCosto)
              const lordo = ((parseFloat(r.costoNetto)||0) * 1.04 + 2) * (parseFloat(r.output)||1)
              return (
                <div key={r._k} style={{ border:'1.5px solid var(--line)', borderRadius:10, padding:'14px 16px', marginBottom:10, background:'#fff' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'150px 1fr 130px 80px 60px', gap:10, alignItems:'end' }}>
                    <div>
                      <label style={S.label}>Centro costo</label>
                      <select style={inputStyle(false)} value={r.centroCosto} onChange={e => updateRiga(r._k, { centroCosto: e.target.value })}>
                        <option value="">— Seleziona —</option>
                        {centri.map(cc => <option key={cc}>{cc}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Servizio</label>
                      {svcs.length > 0
                        ? <select style={inputStyle(false)} value={r.servizioId} onChange={e => updateRiga(r._k, { servizioId: e.target.value })}>
                            <option value="">— Seleziona —</option>
                            {svcs.map(s => <option key={s._fsId} value={s._fsId}>{s.nome}</option>)}
                          </select>
                        : <input style={inputStyle(false)} value={r.servizio} onChange={e => updateRiga(r._k, { servizio: e.target.value })} placeholder="Servizio" />
                      }
                    </div>
                    <div>
                      <label style={S.label}>Costo netto (€)</label>
                      <input type="number" style={{ ...inputStyle(false), textAlign:'right' }}
                        value={r.costoNetto} onChange={e => updateRiga(r._k, { costoNetto: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <label style={S.label}>Output</label>
                      <input type="number" min="1" style={{ ...inputStyle(false), textAlign:'center' }}
                        value={r.output} onChange={e => updateRiga(r._k, { output: e.target.value })} />
                    </div>
                    <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2 }}>
                      <button onClick={() => setForm(f => ({ ...f, righe: f.righe.filter(x => x._k !== r._k) }))}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', fontSize:18, padding:'4px 8px', borderRadius:6 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end', gap:8 }}>
                    <span style={{ fontSize:11, color:'var(--text-dim)' }}>Lordo totale:</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>{fmt(lordo)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Calcoli */}
          <div style={S.calcBox}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:14 }}>Calcolo economico</div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Moltiplicatore margine — {parseFloat(form.moltiplicatore).toFixed(2)}</label>
              <input type="range" min="0.30" max="0.95" step="0.01"
                value={form.moltiplicatore} onChange={e => set('moltiplicatore', e.target.value)}
                style={{ width:'100%', accentColor:'var(--teal)', marginBottom:4 }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div style={S.group}>
                <label style={S.label}>Prezzo override (vuoto = automatico)</label>
                <input type="number" step="0.01" style={inputStyle(false)}
                  value={form.prezzoOverride||''} onChange={e => set('prezzoOverride', e.target.value)}
                  placeholder={fmt(calc.prezzoAuto)} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10 }}>
              {[
                { label:'Costo Pillole', val: fmt(calc.costoTot) },
                { label:'Prezzo netto', val: fmt(calc.prezzoNetto), hi:true },
                { label:'IVA 22%', val: fmt(calc.iva) },
                { label:'Totale lordo', val: fmt(calc.totaleLordo), bold:true },
                { label:`Margine ${calc.marginePerc.toFixed(0)}%`, val: fmt(calc.margine), col: calc.margine >= 0 ? 'var(--teal)' : 'var(--red)' },
              ].map(({ label, val, hi, bold, col }) => (
                <div key={label} style={{ background:'#fff', borderRadius:8, padding:'10px 12px', border: hi ? '2px solid var(--teal)' : '1px solid var(--line)' }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.5px', color:'var(--muted)', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14, fontWeight: bold||hi ? 800 : 600, fontFamily:'var(--font-head)', color: col||'var(--ink)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          <div style={{ ...S.group, marginTop:16 }}>
            <label style={S.label}>Note interne</label>
            <textarea style={{ ...inputStyle(focused.note), minHeight:72, resize:'vertical' }}
              value={form.note||''} onChange={e => set('note', e.target.value)}
              onFocus={() => setFocused(f=>({...f,note:true}))}
              onBlur={() => setFocused(f=>({...f,note:false}))}
              placeholder="Note operative, riferimenti…" />
          </div>
        </div>

        <div style={S.modalFooter}>
          <button onClick={onClose} style={{ padding:'9px 18px', background:'#fff', border:'1.5px solid var(--line)', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'9px 20px', background:'var(--ink)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700, opacity: saving ? .6 : 1 }}>
            {saving ? '⏳ Salvataggio…' : '💾 Salva Preventivo'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   WIZARD ACCETTAZIONE
══════════════════════════════════════════════════════════════ */
function WizardAccettazione({ preventivo, clienti, professionisti, onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — dati contratto
  const [tipoContratto, setTipoContratto] = useState(preventivo.tipoContratto || 'ricorrente')
  const [meseInizio, setMeseInizio] = useState(preventivo.meseInizio || new Date().getMonth()+1)
  const [annoInizio, setAnnoInizio] = useState(preventivo.annoInizio || 2026)
  const [durata, setDurata] = useState(preventivo.durata || 12)
  const [modalitaFatturazione, setModalitaFatturazione] = useState(preventivo.modalitaFatturazione || 'consuntivo')

  // Step 2 — cliente
  const clienteEsistente = clienti.find(c => c.id === preventivo.clienteId || c.nome?.toLowerCase() === preventivo.clienteNome?.toLowerCase())
  const [clienteId, setClienteId] = useState(clienteEsistente?.id || preventivo.clienteId || '')
  const [clienteNome, setClienteNome] = useState(clienteEsistente?.nome || preventivo.clienteNome || '')
  const [nuovoCliente, setNuovoCliente] = useState(!clienteEsistente)
  const [datiCliente, setDatiCliente] = useState({ nome: clienteEsistente?.nome || preventivo.clienteNome || '', ragioneSociale:'', piva:'', indirizzo:'', cap:'', citta:'', email: clienteEsistente?.email || '', telefono:'' })

  // Step 3 — assegnazione costi
  const [righe, setRighe] = useState(() =>
    (preventivo.righe || []).map((r, i) => ({
      ...r,
      _i: i,
      professionistaId: '',
      professionistaNome: '',
    }))
  )

  const setRiga = (i, patch) => setRighe(rs => rs.map(r => r._i === i ? { ...r, ...patch } : r))

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      let finalClienteId = clienteId
      let finalClienteNome = clienteNome

      if (nuovoCliente || !clienteId) {
        finalClienteNome = datiCliente.nome
        finalClienteId = await addItem(cols.clienti, { ...datiCliente, createdAt: serverTimestamp() })
      }

      const righeConProf = righe.map(r => {
        const prof = professionisti.find(p => p.id === r.professionistaId)
        return { ...r, professionistaNome: prof?.nome || r.professionistaNome || '' }
      })

      await accettaPreventivo(preventivo, {
        clienteId: finalClienteId,
        clienteNome: finalClienteNome,
        tipoContratto,
        meseInizio,
        annoInizio,
        durata,
        modalitaFatturazione,
        righeConProfessionista: righeConProf,
      })

      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const steps = ['Contratto', 'Cliente', 'Costi', 'Conferma']
  const calc = useMemo(() => prevCompute({ ...preventivo, righe }), [preventivo, righe])

  return (
    <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth:700 }}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>✅ Accetta preventivo — {preventivo.progetto}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ padding:'16px 24px', background:'#fff', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8 }}>
          {steps.map((s, idx) => (
            <div key={s} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={S.stepDot(step === idx+1, step > idx+1)}>
                {step > idx+1 ? '✓' : idx+1}
              </div>
              <span style={{ fontSize:12, fontWeight:600, color: step === idx+1 ? 'var(--ink)' : 'var(--muted)' }}>{s}</span>
              {idx < steps.length-1 && <div style={{ width:24, height:1, background:'var(--line)', margin:'0 4px' }} />}
            </div>
          ))}
        </div>

        <div style={S.modalBody}>
          {/* Step 1 — Contratto */}
          {step === 1 && (
            <div>
              <p style={{ fontSize:13, color:'var(--text-dim)', marginBottom:20 }}>
                Definisci le condizioni del contratto che verrà generato.
              </p>
              <div style={S.row2}>
                <div style={S.group}>
                  <label style={S.label}>Tipo contratto</label>
                  <select style={inputStyle(false)} value={tipoContratto} onChange={e => setTipoContratto(e.target.value)}>
                    <option value="ricorrente">Ricorrente (mensile)</option>
                    <option value="spot">Una tantum (spot)</option>
                  </select>
                </div>
                <div style={S.group}>
                  <label style={S.label}>Modalità fatturazione</label>
                  <select style={inputStyle(false)} value={modalitaFatturazione} onChange={e => setModalitaFatturazione(e.target.value)}>
                    <option value="consuntivo">A consuntivo</option>
                    <option value="anticipata">Anticipata</option>
                    <option value="rate">A rate</option>
                  </select>
                </div>
                <div style={S.group}>
                  <label style={S.label}>Mese inizio</label>
                  <select style={inputStyle(false)} value={meseInizio} onChange={e => setMeseInizio(parseInt(e.target.value))}>
                    {MESI.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div style={S.group}>
                  <label style={S.label}>Anno inizio</label>
                  <select style={inputStyle(false)} value={annoInizio} onChange={e => setAnnoInizio(parseInt(e.target.value))}>
                    {ANNI.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                {tipoContratto === 'ricorrente' && (
                  <div style={S.group}>
                    <label style={S.label}>Durata (mesi)</label>
                    <input type="number" min="1" max="120" style={inputStyle(false)}
                      value={durata} onChange={e => setDurata(parseInt(e.target.value)||12)} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Cliente */}
          {step === 2 && (
            <div>
              <p style={{ fontSize:13, color:'var(--text-dim)', marginBottom:20 }}>
                {clienteEsistente ? 'Cliente trovato in anagrafica. Verifica o aggiorna i dati.' : 'Cliente non trovato. Inserisci i dati per crearlo.'}
              </p>
              {!nuovoCliente && clienteEsistente ? (
                <div>
                  <div style={{ background:'var(--cream-d)', border:'1px solid var(--line)', borderRadius:10, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{clienteEsistente.nome}</div>
                      <div style={{ fontSize:12, color:'var(--text-dim)', marginTop:2 }}>{clienteEsistente.email || 'Nessuna email'}</div>
                    </div>
                    <button onClick={() => setNuovoCliente(true)}
                      style={{ padding:'6px 12px', background:'#fff', border:'1px solid var(--line)', borderRadius:6, cursor:'pointer', fontSize:12 }}>
                      Modifica dati
                    </button>
                  </div>
                </div>
              ) : (
                <div style={S.row2}>
                  <div style={S.group}>
                    <label style={S.label}>Nome / Ragione sociale *</label>
                    <input style={inputStyle(false)} value={datiCliente.nome} onChange={e => setDatiCliente(d=>({...d,nome:e.target.value}))} />
                  </div>
                  <div style={S.group}>
                    <label style={S.label}>P.IVA</label>
                    <input style={inputStyle(false)} value={datiCliente.piva||''} onChange={e => setDatiCliente(d=>({...d,piva:e.target.value}))} />
                  </div>
                  <div style={S.group}>
                    <label style={S.label}>Email</label>
                    <input type="email" style={inputStyle(false)} value={datiCliente.email||''} onChange={e => setDatiCliente(d=>({...d,email:e.target.value}))} />
                  </div>
                  <div style={S.group}>
                    <label style={S.label}>Telefono</label>
                    <input style={inputStyle(false)} value={datiCliente.telefono||''} onChange={e => setDatiCliente(d=>({...d,telefono:e.target.value}))} />
                  </div>
                  <div style={S.group}>
                    <label style={S.label}>Indirizzo</label>
                    <input style={inputStyle(false)} value={datiCliente.indirizzo||''} onChange={e => setDatiCliente(d=>({...d,indirizzo:e.target.value}))} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
                    <div style={S.group}>
                      <label style={S.label}>CAP</label>
                      <input style={inputStyle(false)} value={datiCliente.cap||''} onChange={e => setDatiCliente(d=>({...d,cap:e.target.value}))} />
                    </div>
                    <div style={S.group}>
                      <label style={S.label}>Città</label>
                      <input style={inputStyle(false)} value={datiCliente.citta||''} onChange={e => setDatiCliente(d=>({...d,citta:e.target.value}))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Assegna costi a professionisti */}
          {step === 3 && (
            <div>
              <p style={{ fontSize:13, color:'var(--text-dim)', marginBottom:16 }}>
                Assegna ogni riga di costo a un professionista specifico.
              </p>
              {righe.length === 0 && (
                <div style={{ textAlign:'center', padding:32, color:'var(--text-dim)', border:'1.5px dashed var(--line)', borderRadius:10 }}>
                  Nessuna riga di costo nel preventivo.
                </div>
              )}
              {righe.map(r => (
                <div key={r._i} style={{ border:'1.5px solid var(--line)', borderRadius:10, padding:'14px 16px', marginBottom:10, background:'#fff' }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>
                    {r.servizio || r.centroCosto || `Riga ${r._i+1}`}
                    <span style={{ marginLeft:8, fontSize:11, color:'var(--text-dim)' }}>
                      Costo netto: {fmt(parseFloat(r.costoNetto)||0)}
                    </span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <label style={S.label}>Professionista</label>
                      <select style={inputStyle(false)} value={r.professionistaId}
                        onChange={e => {
                          const p = professionisti.find(x => x.id === e.target.value)
                          setRiga(r._i, { professionistaId: e.target.value, professionistaNome: p?.nome || '' })
                        }}>
                        <option value="">— Da assegnare —</option>
                        {[...professionisti].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(p => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Costo netto (€)</label>
                      <input type="number" style={{ ...inputStyle(false), textAlign:'right' }}
                        value={r.costoNetto} onChange={e => setRiga(r._i, { costoNetto: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 4 — Riepilogo */}
          {step === 4 && (
            <div>
              <p style={{ fontSize:13, color:'var(--text-dim)', marginBottom:20 }}>
                Riepilogo di ciò che verrà creato su Firestore.
              </p>
              {[
                { label:'Progetto creato', val: preventivo.progetto },
                { label:'Cliente', val: clienteEsistente?.nome || datiCliente.nome || clienteNome },
                { label:'Tipo contratto', val: tipoContratto === 'ricorrente' ? `Ricorrente — ${durata} mesi` : 'Una tantum' },
                { label:'Inizio', val: `${MESI[meseInizio-1]} ${annoInizio}` },
                { label:'Fatturazione', val: modalitaFatturazione },
                { label:'Ricavo netto totale', val: fmt(calc.prezzoNetto) },
                { label:'Costo totale operatori', val: fmt(calc.costoTot) },
                { label:'Margine', val: `${fmt(calc.margine)} (${calc.marginePerc.toFixed(0)}%)` },
              ].map(({ label, val }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--line)', fontSize:13 }}>
                  <span style={{ color:'var(--muted)', fontWeight:500 }}>{label}</span>
                  <span style={{ fontWeight:700 }}>{val}</span>
                </div>
              ))}

              <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(82,161,163,.08)', border:'1px solid rgba(82,161,163,.25)', borderRadius:10, fontSize:12, color:'var(--teal-d)' }}>
                ✓ Verrà creato 1 progetto, {tipoContratto === 'ricorrente' ? durata : 1} fattura{tipoContratto === 'ricorrente' && durata > 1 ? 'e' : ''} da emettere e {righe.filter(r=>r.costoNetto).length * (tipoContratto === 'ricorrente' ? durata : 1)} fatture da ricevere nel budget.
              </div>

              {error && (
                <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(221,36,75,.08)', border:'1px solid rgba(221,36,75,.2)', borderRadius:8, color:'var(--red)', fontSize:13 }}>
                  ✗ {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={S.modalFooter}>
          <button onClick={() => step > 1 ? setStep(s=>s-1) : onClose()}
            style={{ padding:'9px 18px', background:'#fff', border:'1.5px solid var(--line)', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700 }}>
            {step > 1 ? '← Indietro' : 'Annulla'}
          </button>
          {step < 4
            ? <button onClick={() => setStep(s=>s+1)}
                style={{ padding:'9px 20px', background:'var(--ink)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700 }}>
                Avanti →
              </button>
            : <button onClick={handleConfirm} disabled={saving}
                style={{ padding:'9px 20px', background:'var(--teal)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:700, opacity: saving ? .6 : 1 }}>
                {saving ? '⏳ Creazione in corso…' : '✅ Conferma e crea progetto'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   VISTA PRINCIPALE
══════════════════════════════════════════════════════════════ */
export default function Preventivi() {
  const preventivi = usePreventivi()
  const servizi    = useServizi()
  const { clienti, professionisti } = useData()

  const [modal, setModal] = useState(null)        // null | 'new' | {prev}
  const [wizard, setWizard] = useState(null)      // null | {prev}
  const [search, setSearch] = useState('')
  const [filtroStato, setFiltroStato] = useState('')
  const [success, setSuccess] = useState('')

  const stats = useMemo(() => {
    const all = preventivi
    const accettati = all.filter(p => ['Da Contrattualizzare','Contrattualizzato'].includes(p.stato))
    const inviati   = all.filter(p => p.stato === 'Preventivo Inviato')
    return {
      totale:     all.length,
      accettati:  accettati.length,
      inviati:    inviati.length,
      fatturato:  accettati.reduce((s,p) => s + prevCompute(p).prezzoNetto, 0),
      pipeline:   inviati.reduce((s,p) => s + prevCompute(p).prezzoNetto, 0),
      margineAvg: accettati.length ? accettati.reduce((s,p) => s + prevCompute(p).marginePerc, 0) / accettati.length : 0,
    }
  }, [preventivi])

  const lista = useMemo(() => {
    let arr = [...preventivi].sort((a,b) => (b.data||'').localeCompare(a.data||''))
    if (search) { const q = search.toLowerCase(); arr = arr.filter(p => (p.progetto||'').toLowerCase().includes(q) || (p.clienteNome||'').toLowerCase().includes(q) || (p.excelId||'').toLowerCase().includes(q)) }
    if (filtroStato) arr = arr.filter(p => p.stato === filtroStato)
    return arr
  }, [preventivi, search, filtroStato])

  async function handleSave(data) {
    if (modal?._fsId) await updateDoc(doc(db, 'preventivi', modal._fsId), { ...data, updatedAt: serverTimestamp() })
    else await addDoc(collection(db, 'preventivi'), { ...data, createdAt: serverTimestamp() })
  }

  async function handleDelete(p) {
    if (!window.confirm(`Eliminare "${p.progetto || 'questo preventivo'}"?`)) return
    await deleteDoc(doc(db, 'preventivi', p._fsId))
  }

  async function handleStatoChange(p, nuovoStato) {
    if (nuovoStato === 'Contrattualizzato' && p.stato !== 'Contrattualizzato') {
      setWizard(p)
      return
    }
    await updateDoc(doc(db, 'preventivi', p._fsId), { stato: nuovoStato, updatedAt: serverTimestamp() })
  }

  function statoBadge(stato) {
    const s = STATO_STYLE[stato] || { bg:'#eee', color:'#555' }
    return <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:99, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.4px', background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{stato}</span>
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Preventivi</h1>
          <p className="view-subtitle">Gestione preventivi e offerte commerciali</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setModal('new')}>+ Nuovo Preventivo</button>
        </div>
      </div>

      {success && (
        <div style={{ background:'rgba(82,161,163,.1)', border:'1px solid rgba(82,161,163,.3)', borderRadius:10, padding:'12px 16px', marginBottom:16, color:'var(--teal-d)', fontSize:13, fontWeight:600 }}>
          ✅ {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom:20 }}>
        <div className="stat-card"><div className="stat-label">Totale preventivi</div><div className="stat-value">{stats.totale}</div></div>
        <div className="stat-card gold"><div className="stat-label">Pipeline (inviati)</div><div className="stat-value">{Math.round(stats.pipeline/1000)}k€</div><div className="stat-note">{stats.inviati} preventivi</div></div>
        <div className="stat-card green"><div className="stat-label">Fatturato accettato</div><div className="stat-value">{Math.round(stats.fatturato/1000)}k€</div><div className="stat-note">{stats.accettati} preventivi</div></div>
        <div className="stat-card"><div className="stat-label">Margine medio</div><div className="stat-value">{stats.margineAvg.toFixed(0)}%</div><div className="stat-note">su preventivi accettati</div></div>
      </div>

      {/* Filtri */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca ID, progetto, cliente…" style={{ maxWidth:280 }} />
          <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} style={{ width:'auto' }}>
            <option value="">Tutti gli stati</option>
            {STATI.map(s => <option key={s}>{s}</option>)}
          </select>
          {(search||filtroStato) && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFiltroStato('') }}>✕ Reset</button>}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-dim)' }}>{lista.length} preventivi</span>
        </div>
      </div>

      {/* Tabella */}
      <div className="card">
        {lista.length === 0 ? (
          <div className="empty-state"><div className="icon">💰</div><p>Nessun preventivo trovato.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Data</th><th>Cliente</th><th>Progetto</th><th>Tipo</th><th>Stato</th>
                  <th className="num">Prezzo netto</th><th className="num">Margine</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const c = prevCompute(p)
                  return (
                    <tr key={p._fsId}>
                      <td style={{ fontFamily:'monospace', fontSize:11, fontWeight:600 }}>{p.excelId||'—'}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{p.data||'—'}</td>
                      <td style={{ fontWeight:500 }}>{p.clienteNome || clienti?.find(c=>c.id===p.clienteId)?.nome || '—'}</td>
                      <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.progetto||'—'}</td>
                      <td>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background: p.tipoContratto==='ricorrente' ? 'rgba(82,161,163,.1)' : '#FDF1CB', color: p.tipoContratto==='ricorrente' ? 'var(--teal-d)' : '#8a6a1c' }}>
                          {p.tipoContratto==='ricorrente' ? `↺ ${p.durata||'?'}m` : '1×'}
                        </span>
                      </td>
                      <td>
                        <select
                          value={p.stato||''}
                          onChange={e => handleStatoChange(p, e.target.value)}
                          style={{ border:'none', background:'transparent', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.3px', cursor:'pointer', color: (STATO_STYLE[p.stato]||{}).color, padding:'2px 4px', borderRadius:4 }}
                        >
                          {STATI.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="num" style={{ fontWeight:700 }}>{fmt(c.prezzoNetto)}</td>
                      <td className="num" style={{ color: c.margine>=0?'var(--teal)':'var(--red)', fontWeight:700 }}>
                        {fmt(c.margine)} <span style={{ fontSize:10, opacity:.7 }}>({c.marginePerc.toFixed(0)}%)</span>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => setModal(p)} style={{ padding:'5px 10px', background:'#fff', border:'1.5px solid var(--line)', borderRadius:6, cursor:'pointer', fontSize:12 }}>✏️</button>
                          <button onClick={() => handleDelete(p)} style={{ padding:'5px 10px', background:'#fff', border:'1.5px solid var(--red)', borderRadius:6, cursor:'pointer', fontSize:12, color:'var(--red)' }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <PrevModal
          preventivo={modal === 'new' ? null : modal}
          clienti={clienti||[]}
          servizi={servizi}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {wizard && (
        <WizardAccettazione
          preventivo={wizard}
          clienti={clienti||[]}
          professionisti={professionisti||[]}
          onClose={() => setWizard(null)}
          onDone={() => {
            setWizard(null)
            setSuccess(`Preventivo "${wizard.progetto}" accettato. Progetto e fatture budget creati automaticamente.`)
            setTimeout(() => setSuccess(''), 6000)
          }}
        />
      )}
    </div>
  )
}
