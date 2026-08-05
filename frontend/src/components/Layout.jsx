import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'supervisor'] },
  { to: '/restaurants', label: 'Restaurantes', icon: '🏪', roles: ['admin'] },
  { to: '/users', label: 'Usuarios', icon: '👥', roles: ['admin'] },
  { to: '/categories', label: 'Categorías', icon: '📁', roles: ['admin', 'supervisor'] },
  { to: '/products', label: 'Productos', icon: '🍔', roles: ['admin', 'supervisor'] },
  { to: '/orders', label: 'Pedidos (POS)', icon: '🧾', roles: ['admin', 'supervisor', 'waiter', 'cashier'] },
  { to: '/kitchen', label: 'Cocina (KDS)', icon: '👨‍🍳', roles: ['admin', 'supervisor', 'cook'] },
  { to: '/inventory', label: 'Inventario', icon: '📦', roles: ['admin', 'supervisor'] },
  { to: '/invoices', label: 'Facturación', icon: '💰', roles: ['admin', 'supervisor', 'cashier'] },
  { to: '/audit-logs', label: 'Auditoría', icon: '📋', roles: ['admin'] },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleNavItems = navItems.filter(item => user && item.roles.includes(user.role))

  return (
    <div className="min-h-screen flex bg-gray-900">
      {/* Sidebar Oscuro Elegante */}
      <aside className={`bg-gray-900 border-r border-gray-800 text-white w-64 flex-col transition-all duration-300 ${sidebarOpen ? 'flex fixed md:relative z-50 h-full' : 'hidden md:flex'}`}>
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 to-orange-500 text-transparent bg-clip-text">
            GastroFlow
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{user?.role || 'Rol'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all duration-200 border-l-4 ${
                  isActive
                    ? 'bg-gray-800 text-amber-400 border-amber-400'
                    : 'text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-white'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="mb-4 px-4">
            <p className="font-semibold text-white text-sm">{user?.full_name || 'Usuario'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.id}</p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 justify-center text-sm p-2 rounded-lg text-gray-400 hover:bg-red-600 hover:text-white transition-colors duration-200"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between md:hidden">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 text-2xl">
            ☰
          </button>
          <h1 className="text-lg font-bold text-amber-400">GastroFlow</h1>
          <div className="w-6"></div>
        </header>
        <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-gray-900 text-white">
          {/* La animación fadeInUp se aplica al contenedor de cada página */}
          <div className="animate-fadeInUp">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}