import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AgentProfile, Organization } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: AgentProfile | null
  organization: Organization | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchingRef = useRef(false) // prevent duplicate fetches

  const fetchProfile = async (userId: string) => {
    if (fetchingRef.current) {
      console.log('[Auth] fetchProfile already in progress, skipping duplicate call')
      return
    }
    fetchingRef.current = true
    console.log('[Auth] fetchProfile START for:', userId)

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('agent_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('[Auth] profile result:', { profileData, profileError })

      if (profileError) {
        console.error('[Auth] Profile fetch failed:', profileError.message, profileError.code)
        return
      }

      setProfile(profileData)

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profileData.organization_id)
        .single()

      console.log('[Auth] org result:', { orgData, orgError })

      if (orgError) {
        console.error('[Auth] Org fetch failed:', orgError.message)
        return
      }

      setOrganization(orgData)
      console.log('[Auth] All data loaded successfully. Org slug:', orgData.slug)
    } catch (err) {
      console.error('[Auth] Unexpected error in fetchProfile:', err)
    } finally {
      fetchingRef.current = false
      setLoading(false)
      console.log('[Auth] fetchProfile END, loading set to false')
    }
  }

  useEffect(() => {
    let initialSessionHandled = false

    // First: get current session synchronously
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[Auth] getSession:', { hasSession: !!session, error })
      initialSessionHandled = true
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Second: listen for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] onAuthStateChange:', event, '| hasSession:', !!session)

      // Skip INITIAL_SESSION — already handled by getSession above
      if (event === 'INITIAL_SESSION') {
        console.log('[Auth] Skipping INITIAL_SESSION (handled by getSession)')
        return
      }

      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        fetchingRef.current = false // reset so new login can fetch
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setOrganization(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn:', email)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.log('[Auth] signIn result:', { user: !!data?.user, error })
      if (error) return { error }
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    console.log('[Auth] signOut')
    await supabase.auth.signOut()
    fetchingRef.current = false
    setUser(null)
    setSession(null)
    setProfile(null)
    setOrganization(null)
    setLoading(false)
  }

  const refreshProfile = async () => {
    if (user) {
      fetchingRef.current = false
      await fetchProfile(user.id)
    }
  }

  console.log('[Auth] state — loading:', loading, '| user:', !!user, '| profile:', !!profile, '| org:', organization?.slug ?? null)

  return (
    <AuthContext.Provider value={{ user, session, profile, organization, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
