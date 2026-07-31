import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// 1. DEFINIMOS QUIÉN PUEDE VER QUÉ
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

  // 2. FILTRAMOS LOS ITEMS SEGÚN EL ROL DEL USUARIO LOGUEADO
  const visibleNavItems = navItems.filter(item => user && item.roles.includes(user.role))

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`bg-gray-800 text-white w-64 flex flex-col ${sidebarOpen ? 'block' : 'hidden'} md:block`}>
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">GastroFlow</h1>
          <p className="text-sm text-gray-400 capitalize">Rol: {user?.role || 'N/A'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* 3. PINTAMOS SOLO LOS ITEMS PERMITIDOS */}
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 p-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="mb-4 text-sm text-gray-400">
            <p className="font-bold text-white">{user?.full_name || 'Usuario'}</p>
            <p className="truncate">{user?.id}</p>
          </div>
          <button
            onClick={logout}
            className="w-full text-left p-2 rounded hover:bg-red-600 transition flex items-center gap-2"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow px-4 py-3 flex items-center justify-between md:hidden">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-600">
            ☰
          </button>
          <h1 className="text-lg font-semibold">GastroFlow</h1>
          <div></div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  )
}