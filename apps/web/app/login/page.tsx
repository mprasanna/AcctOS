'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = async (e: any) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    window.location.href = '/dashboard'
  }

  return (
    <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <form onSubmit={login} style={{ display:'flex', flexDirection:'column', gap:12, width:320 }}>
        <h1 style={{ margin:0, fontSize:24, fontWeight:700 }}>AcctOS</h1>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
          style={{ padding:'10px 12px', border:'1px solid #ccc', borderRadius:8, fontSize:14 }} />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}
          style={{ padding:'10px 12px', border:'1px solid #ccc', borderRadius:8, fontSize:14 }} />
        {error && <p style={{ color:'red', margin:0, fontSize:13 }}>{error}</p>}
        <button type="submit"
          style={{ padding:'10px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>
          Sign In
        </button>
      </form>
    </div>
  )
}
