import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { orderAPI, productAPI } from '../api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    activeOrders: 0,
    activeProducts: 0,
    totalRevenue: 0,
    stockAlerts: 0
  })
  const [weeklyData, setWeeklyData] = useState([])
  const [orderStatusData, setOrderStatusData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.tenantId) return
      try {
        const [orders, products] = await Promise.all([
          orderAPI.list(user.tenantId),
          productAPI.list(user.tenantId)
        ])

        const activeOrders = orders.filter(o => o.status !== 'cancelled')
        const totalRevenue = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0)
        const stockAlerts = products.filter(p => p.stock <= p.min_stock).length

        setStats({
          activeOrders: activeOrders.length,
          activeProducts: products.length,
          totalRevenue: totalRevenue,
          stockAlerts: stockAlerts
        })

        const last7Days = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' })
          const dailyRevenue = orders
            .filter(o => o.status !== 'cancelled' && new Date(o.created_at).toDateString() === d.toDateString())
            .reduce((sum, o) => sum + (o.total || 0), 0)
          last7Days.push({ name: dayName, Ingresos: dailyRevenue })
        }
        setWeeklyData(last7Days)

        const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed']
        const statusCounts = {}
        activeOrders.forEach(o => {
          statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
        })
        const pieData = statuses
          .filter(s => statusCounts[s])
          .map(s => ({ name: s, value: statusCounts[s] }))
        setOrderStatusData(pieData)

      } catch (err) {
        toast.error('Error al cargar las métricas')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [user])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
  }

  const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#6B7280', '#EC4899']

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Cargando métricas...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Título con animación */}
      <h1 className="text-3xl font-extrabold mb-2 text-gray-800 animate-fadeInUp">
        Dashboard
      </h1>
      <p className="text-gray-500 mb-8 text-sm">Resumen operativo en tiempo real</p>

      {/* TARJETAS DE MÉTRICAS - Con efectos hover y animación escalonada */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
       
        {/* Tarjeta Pedidos Activos */}
        <div
          className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-2xl shadow-lg text-white
                     transform hover:scale-105 hover:shadow-2xl transition-all duration-300 cursor-pointer
                     animate-fadeInUp"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-blue-100 text-xs uppercase tracking-wider font-semibold">Pedidos Activos</h3>
            <span className="text-2xl opacity-80">📊</span>
          </div>
          <p className="text-4xl font-extrabold">{stats.activeOrders}</p>
          <p className="text-blue-200 text-xs mt-2">En curso ahora mismo</p>
        </div>

        {/* Tarjeta Ingresos Totales */}
        <div
          className="bg-gradient-to-br from-green-500 to-green-700 p-6 rounded-2xl shadow-lg text-white
                     transform hover:scale-105 hover:shadow-2xl transition-all duration-300 cursor-pointer
                     animate-fadeInUp"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-green-100 text-xs uppercase tracking-wider font-semibold">Ingresos Totales</h3>
            <span className="text-2xl opacity-80">💰</span>
          </div>
          <p className="text-4xl font-extrabold">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-green-200 text-xs mt-2">Acumulado de pedidos activos</p>
        </div>

        {/* Tarjeta Productos Activos */}
        <div
          className="bg-white p-6 rounded-2xl shadow-md border border-gray-100
                     transform hover:scale-105 hover:shadow-xl transition-all duration-300 cursor-pointer
                     animate-fadeInUp"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Productos Activos</h3>
            <span className="text-2xl opacity-80">🍔</span>
          </div>
          <p className="text-4xl font-extrabold text-gray-800">{stats.activeProducts}</p>
          <p className="text-gray-400 text-xs mt-2">En el menú actual</p>
        </div>

        {/* Tarjeta Alertas de Stock */}
        <div
          className={`p-6 rounded-2xl shadow-md border transform hover:scale-105 hover:shadow-xl transition-all duration-300 cursor-pointer animate-fadeInUp
                      ${stats.stockAlerts > 0
                        ? 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-600'
                        : 'bg-white border-gray-100 text-gray-800'}`}
          style={{ animationDelay: '0.4s' }}
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className={`text-xs uppercase tracking-wider font-semibold ${stats.stockAlerts > 0 ? 'text-red-100' : 'text-gray-500'}`}>
              Alertas de Stock
            </h3>
            <span className="text-2xl opacity-80">📦</span>
          </div>
          <p className="text-4xl font-extrabold">{stats.stockAlerts}</p>
          <p className={`text-xs mt-2 ${stats.stockAlerts > 0 ? 'text-red-200' : 'text-gray-400'}`}>
            {stats.stockAlerts > 0 ? '¡Revisar inventario!' : 'Todo en orden'}
          </p>
        </div>
      </div>

      {/* SECCIÓN DE GRÁFICOS - Con animación escalonada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
       
        {/* Gráfico de Barras */}
        <div
          className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 animate-fadeInUp hover:shadow-lg transition-shadow duration-300"
          style={{ animationDelay: '0.5s' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📈</span>
            <h2 className="text-lg font-bold text-gray-800">Ingresos de la Última Semana</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyData}>
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip
                cursor={{fill: 'rgba(59, 130, 246, 0.05)'}}
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '14px'
                }}
                formatter={(value) => formatCurrency(value)}
              />
              <Bar dataKey="Ingresos" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Pastel */}
        <div
          className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 animate-fadeInUp hover:shadow-lg transition-shadow duration-300"
          style={{ animationDelay: '0.6s' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🥧</span>
            <h2 className="text-lg font-bold text-gray-800">Estado de Pedidos (En vivo)</h2>
          </div>
          {orderStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={orderStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={3}
                  fill="#8884d8"
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: '500' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-gray-400">
              <span className="text-4xl mb-2">🍽️</span>
              <p>No hay pedidos activos para graficar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Mensaje de Bienvenida */}
      <div
        className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 rounded-2xl shadow-lg text-white animate-fadeInUp"
        style={{ animationDelay: '0.7s' }}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-2xl font-bold">
            {user?.full_name?.charAt(0) || 'A'}
          </div>
          <div>
            <h2 className="text-lg font-bold">Bienvenido, {user?.full_name || 'Administrador'} 👋</h2>
            <p className="text-gray-400 text-sm">Revisa el rendimiento de tu restaurante en tiempo real. Usa el panel lateral para gestionar tus operaciones.</p>
          </div>
        </div>
      </div>
    </div>
  )
}