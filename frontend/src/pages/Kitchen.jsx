import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { orderAPI } from '../api'
import toast from 'react-hot-toast'

export default function Kitchen() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const loadOrders = async () => {
    if (!user?.tenantId) return
    try {
      // Traemos los pedidos que están pendientes o en preparación
      const data = await orderAPI.list(user.tenantId, 'pending,confirmed,preparing')
      setOrders(data)
    } catch (err) {
      console.error('Error al cargar pedidos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()

    // === MAGIA DEL WEBSOCKET ===
    let ws = null;
    if (user?.tenantId) {
      const token = localStorage.getItem('access_token')
      // Nos conectamos al WebSocket del backend
      const wsUrl = `ws://localhost:8000/api/v1/ws/${user.tenantId}?token=${token}`
      ws = new WebSocket(wsUrl)

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        // Si la cocina recibe la señal de nuevo pedido, recarga la lista
        if (data.event === 'new_order') {
          toast.success('¡Nuevo pedido recibido!')
          loadOrders()
        }
      }

      ws.onclose = () => {
        console.log('WebSocket desconectado')
      }
    }

    // Limpieza al cerrar el componente
    return () => {
      if (ws) ws.close()
    }
  }, [user])

  const handleAccept = async (id) => {
    try {
      await orderAPI.update(id, { status: 'preparing' })
      toast.success('Pedido en preparación')
      loadOrders()
    } catch (err) {
      toast.error('Error al actualizar pedido')
    }
  }

  if (loading) return <div className="text-center py-12">Cargando cocina...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pantalla de Cocina (KDS)</h1>
     
      {orders.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow text-center text-gray-500">
          No hay pedidos pendientes. ¡Cocina tranquila!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {orders.map(order => (
            <div key={order.id} className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg shadow">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-lg text-gray-800">Pedido #{order.order_number}</span>
                <span className="text-xs font-semibold uppercase px-2 py-1 bg-yellow-200 text-yellow-800 rounded">{order.status}</span>
              </div>
              <p className="text-sm text-gray-600 mb-1">Mesa: <span className="font-bold">{order.table_number || 'N/A'}</span></p>
              <p className="text-sm text-gray-600 mb-3">Cliente: <span className="font-bold">{order.customer_name || 'N/A'}</span></p>
             
              <div className="bg-white p-2 rounded border border-gray-200 mb-3">
                <ul className="list-disc list-inside text-sm">
                  {order.items?.map(item => (
                    <li key={item.id}>{item.quantity}x {item.product_name}</li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleAccept(order.id)}
                className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 text-sm font-bold"
              >
                Comenzar a Preparar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 