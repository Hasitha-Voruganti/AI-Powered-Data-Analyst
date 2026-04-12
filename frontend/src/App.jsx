import React, { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import LandingPage from './pages/LandingPage.jsx'
import Dashboard   from './pages/Dashboard.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#14141f', color: '#eeeef8',
            border: '0.5px solid rgba(255,255,255,0.1)',
            fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px',
          },
          success: { iconTheme: { primary: '#00e5a0', secondary: '#14141f' } },
          error:   { iconTheme: { primary: '#ff5757',  secondary: '#14141f' } },
        }}
      />
      {session
        ? <Dashboard session={session} onReset={() => setSession(null)} />
        : <LandingPage onSession={setSession} />}
    </>
  )
}
