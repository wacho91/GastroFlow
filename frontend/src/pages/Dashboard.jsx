import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { orderAPI, productAPI } from '../api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    ordersToday: 0,
    activeProducts: 0,
    revenueToday: 0,
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

        const today = new Date().toDateString()

        // 1. Tarjetas de Métricas
        const ordersToday = orders.filter(o => new Date(o.created_at).toDateString() === today)
        const paidOrdersToday = ordersToday.filter(o => o.status === 'completed' || o.status === 'served')
        const revenueToday = paidOrdersToday.reduce((sum, o) => sum + (o.total || 0), 0)
        const stockAlerts = products.filter(p => p.stock <= p.min_stock).length

        setStats({
          ordersToday: ordersToday.length,
          activeProducts: products.length,
          revenueToday: revenueToday,
          stockAlerts: stockAlerts
        })

        // 2. Datos para Gráfico de Barras (Ingresos de la última semana)
        const last7Days = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' })
         
          const dailyRevenue = orders
            .filter(o => (o.status === 'completed' || o.status === 'served') && new Date(o.created_at).toDateString() === d.toDateString())
            .reduce((sum, o) => sum + (o.total || 0), 0)
           
          last7Days.push({ name: dayName, Ingresos: dailyRevenue })
        }
        setWeeklyData(last7Days)

        // 3. Datos para Gráfico de Pastel (Estados de los pedidos de hoy)
        const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled']
        const statusCounts = {}
        ordersToday.forEach(o => {
          statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
        })
        const pieData = statuses
          .filter(s => statusCounts[s]) // Solo mostrar estados que tengan pedidos
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

  if (loading) return <div className="text-center py-12">Cargando métricas...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
     
      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-lg shadow-lg text-white">
          <h3 className="text-blue-100 text-sm uppercase mb-1">Pedidos hoy</h3>
          <p className="text-3xl font-bold">{stats.ordersToday}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-700 p-6 rounded-lg shadow-lg text-white">
          <h3 className="text-green-100 text-sm uppercase mb-1">Ingresos hoy</h3>
          <p className="text-3xl font-bold">{formatCurrency(stats.revenueToday)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
          <h3 className="text-gray-500 text-sm uppercase mb-1">Productos activos</h3>
          <p className="text-3xl font-bold text-gray-800">{stats.activeProducts}</p>
        </div>
        <div className={`p-6 rounded-lg shadow border ${stats.stockAlerts > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <h3 className="text-gray-500 text-sm uppercase mb-1">Alertas de stock</h3>
          <p className={`text-3xl font-bold ${stats.stockAlerts > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.stockAlerts}</p>
        </div>
      </div>

      {/* SECCIÓN DE GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
       
        {/* Gráfico de Barras: Ingresos de la semana */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Ingresos de la Última Semana</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyData}>
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '10px', color: '#fff' }} formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="Ingresos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Pastel: Estados de pedidos de hoy */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Estado de Pedidos de Hoy</h2>
          {orderStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8">
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '10px', color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              No hay pedidos hoy para graficar.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Bienvenido, {user?.full_name || 'Administrador'} 👋</h2>
        <p className="text-gray-600">Revisa el rendimiento de tu restaurante en tiempo real. Usa el panel lateral para gestionar tus operaciones.</p>
      </div>
    </div>
  )
}
