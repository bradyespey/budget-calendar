//src/pages/AuthCallback.tsx

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase has already read the URL hash and stored the session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        console.error('Auth callback failed:', error)
        return navigate('/login', { replace: true })
      }
      // remove the "#..." from the URL
      window.history.replaceState(null, '', window.location.pathname)
      navigate('/dashboard', { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
    </div>
  )
}