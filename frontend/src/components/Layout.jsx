import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/restaurants', label: 'Restaurantes', icon: '🏪' },
  { to: '/users', label: 'Usuarios', icon: '👥' },
  { to: '/categories', label: 'Categorías', icon: '📁' },
  { to: '/products', label: 'Productos', icon: '🍔' },
  { to: '/orders', label: 'Pedidos', icon: '🧾' },
  { to: '/kitchen', label: 'Cocina', icon: '👨‍🍳' },
  { to: '/inventory', label: 'Inventario', icon: '📦' },
  { to: '/invoices', label: 'Facturación', icon: '💰' },
  { to: '/audit-logs', label: 'Auditoría', icon: '📋' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`bg-gray-800 text-white w-64 flex flex-col ${sidebarOpen ? 'block' : 'hidden'} md:block`}>
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">GastroFlow</h1>
          <p className="text-sm text-gray-400">{user?.role}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => (
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
          <button
            onClick={logout}
            className="w-full text-left p-2 rounded hover:bg-red-600 transition"
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
