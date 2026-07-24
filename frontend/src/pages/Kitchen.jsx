import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { orderAPI, createWebSocket } from '../api'
import toast from 'react-hot-toast'

export default function Kitchen() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [ws, setWs] = useState(null)

  const loadOrders = async () => {
    if (!user?.tenantId) return
    try {
      const data = await orderAPI.list(user.tenantId, 'pending,confirmed,preparing,ready')
      setOrders(data)
    } catch (err) {
      toast.error('Error al cargar pedidos')
    }
  }

  useEffect(() => {
    loadOrders()
    if (user?.tenantId) {
      const socket = createWebSocket(user.tenantId)
      socket.onopen = () => console.log('WebSocket conectado')
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.event === 'new_order' || msg.event === 'status_update') {
            loadOrders()
          }
        } catch {}
      }
      socket.onclose = () => console.log('WebSocket desconectado')
      setWs(socket)
      return () => socket.close()
    }
  }, [user])

  const updateStatus = async (orderId, newStatus) => {
    try {
      await orderAPI.update(orderId, { status: newStatus })
      toast.success('Estado actualizado')
      loadOrders()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const getStatusColor = (status) => {
    const map = { pending: 'bg-yellow-200', confirmed: 'bg-orange-200', preparing: 'bg-blue-200', ready: 'bg-green-200' }
    return map[status] || 'bg-gray-200'
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pantalla de Cocina</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map(order => (
          <div key={order.id} className={`rounded-lg shadow p-4 ${getStatusColor(order.status)}`}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg">Pedido #{order.order_number}</h3>
              <span className="capitalize text-sm font-medium">{order.status}</span>
            </div>
            <p className="text-sm">Mesa: {order.table_number || 'N/A'}</p>
            <ul className="my-2 space-y-1">
              {order.items?.filter(i => i.status !== 'cancelled').map(item => (
                <li key={item.id} className="text-sm">
                  {item.quantity}x {item.product_name}
                  {item.notes && <span className="text-gray-600 italic"> - {item.notes}</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-3">
              {order.status === 'pending' && (
                <button onClick={() => updateStatus(order.id, 'confirmed')} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Aceptar</button>
              )}
              {order.status === 'confirmed' && (
                <button onClick={() => updateStatus(order.id, 'preparing')} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Iniciar preparación</button>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => updateStatus(order.id, 'ready')} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Marcar listo</button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">{new Date(order.created_at).toLocaleTimeString()}</p>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-gray-500 col-span-full">No hay pedidos activos</p>}
      </div>
    </div>
  )
}
