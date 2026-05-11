import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './components/Login'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './components/views/Dashboard'
import Calendario from './components/views/Calendario'
import CashFlow from './components/views/CashFlow'
import Clienti from './components/views/Clienti'
import Progetti from './components/views/Progetti'
import Professionisti from './components/views/Professionisti'
import CostiFissi from './components/views/CostiFissi'
import Rimborsi from './components/views/Rimborsi'
import BusinessUnit from './components/views/BusinessUnit'
import Importazione from './components/views/Importazione'
import Preventivi from './components/views/Preventivi'
import Listino from './components/views/Listino'
import SeedFirestore from './components/views/SeedFirestore'

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Caricamento...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/calendario"    element={<Calendario />} />
          <Route path="/cashflow"      element={<CashFlow />} />
          <Route path="/clienti"       element={<Clienti />} />
          <Route path="/progetti"      element={<Progetti />} />
          <Route path="/professionisti"element={<Professionisti />} />
          <Route path="/costifissi"    element={<CostiFissi />} />
          <Route path="/rimborsi"      element={<Rimborsi />} />
          <Route path="/businessunit"  element={<BusinessUnit />} />
          <Route path="/importazione"  element={<Importazione />} />
          <Route path="/preventivi"    element={<Preventivi />} />
          <Route path="/listino"       element={<Listino />} />
          <Route path="/seed"          element={<SeedFirestore />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRouter() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  )
}
