import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI, setTokens, clearTokens, setOnAuthError } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authAPI.login(email, password)
    setTokens(data.access_token, data.refresh_token)
    // Decodificar payload para obtener info del usuario (sin librería extra, parse manual)
    const payload = JSON.parse(atob(data.access_token.split('.')[1]))
    setUser({
      id: payload.sub,
      tenantId: payload.tenant,
      role: payload.role || 'user'
    })
    return payload
  }, [])

  useEffect(() => {
    // Configurar callback de error de auth para hacer logout automático
    setOnAuthError(() => {
      logout()
      window.location.href = '/login'
    })
    // Verificar si hay token almacenado
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUser({
          id: payload.sub,
          tenantId: payload.tenant,
          role: payload.role || 'user'
        })
      } catch {
        clearTokens()
      }
    }
    setLoading(false)
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
