import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { orderAPI, productAPI } from '../api'
import toast from 'react-hot-toast'

export default function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [newOrder, setNewOrder] = useState({
    table_number: '', customer_name: '', customer_document: '', notes: '', items: [{ product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_percentage: 0, notes: '', sort_order: 0 }]
  })

  const loadOrders = async () => {
    if (!user?.tenantId) return
    try {
      const data = await orderAPI.list(user.tenantId, selectedStatus || undefined)
      setOrders(data)
    } catch (err) {
      toast.error('Error al cargar pedidos')
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    if (!user?.tenantId) return
    try {
      const data = await productAPI.list(user.tenantId)
      setProducts(data)
    } catch {}
  }

  useEffect(() => {
    loadOrders()
    loadProducts()
  }, [user, selectedStatus])

  const handleAddItem = () => {
    setNewOrder({
      ...newOrder,
      items: [...newOrder.items, { product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_percentage: 0, notes: '', sort_order: newOrder.items.length }]
    })
  }

  const handleItemChange = (index, field, value) => {
    const items = [...newOrder.items]
    items[index][field] = value
    // Actualizar precio automático si selecciona producto
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        items[index].unit_price = product.price
        items[index].tax_percentage = product.tax_percentage
      }
    }
    setNewOrder({ ...newOrder, items })
  }

  const handleSubmitOrder = async (e) => {
    e.preventDefault()
    try {
      await orderAPI.create(user.tenantId, {
        table_number: newOrder.table_number || undefined,
        customer_name: newOrder.customer_name || undefined,
        customer_document: newOrder.customer_document || undefined,
        notes: newOrder.notes || undefined,
        items: newOrder.items
      })
      toast.success('Pedido creado')
      setShowCreate(false)
      setNewOrder({ table_number: '', customer_name: '', customer_document: '', notes: '', items: [{ product_id: '', quantity: 1, unit_price: 0, discount: 0, tax_percentage: 0, notes: '', sort_order: 0 }] })
      loadOrders()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await orderAPI.update(orderId, { status: newStatus })
      toast.success('Estado actualizado')
      loadOrders()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Función para cancelar pedido (soft delete)
  const handleCancel = async (orderId) => {
    if (!confirm('¿Cancelar este pedido?')) return
    try {
      await orderAPI.delete(orderId)
      toast.success('Pedido cancelado')
      loadOrders()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <div className="flex gap-2">
          <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="border p-2 rounded">
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmado</option>
            <option value="preparing">Preparando</option>
            <option value="ready">Listo</option>
            <option value="served">Servido</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            {showCreate ? 'Cancelar' : 'Nuevo pedido'}
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmitOrder} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="Mesa" value={newOrder.table_number} onChange={e => setNewOrder({...newOrder, table_number: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Cliente" value={newOrder.customer_name} onChange={e => setNewOrder({...newOrder, customer_name: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Documento cliente" value={newOrder.customer_document} onChange={e => setNewOrder({...newOrder, customer_document: e.target.value})} className="border p-2 rounded" />
          </div>
          <textarea placeholder="Notas" value={newOrder.notes} onChange={e => setNewOrder({...newOrder, notes: e.target.value})} className="border p-2 rounded w-full" rows="2" />
          
          <h3 className="font-semibold">Items del pedido</h3>
          {newOrder.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-b pb-2">
              <select value={item.product_id} onChange={e => handleItemChange(idx, 'product_id', e.target.value)} required className="border p-2 rounded col-span-2">
                <option value="">Seleccionar producto</option>
                {products.filter(p => p.type === 'sale').map(p => (
                  <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                ))}
              </select>
              <input type="number" placeholder="Cant." value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 1)} min="0.01" required className="border p-2 rounded" />
              <input type="number" placeholder="Precio" value={item.unit_price} onChange={e => handleItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)} required className="border p-2 rounded" />
              <input type="number" placeholder="Descuento" value={item.discount} onChange={e => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)} className="border p-2 rounded" />
              <div className="flex gap-2">
                <input placeholder="Nota" value={item.notes} onChange={e => handleItemChange(idx, 'notes', e.target.value)} className="border p-2 rounded flex-1" />
                {newOrder.items.length > 1 && (
                  <button type="button" onClick={() => {
                    const items = newOrder.items.filter((_, i) => i !== idx)
                    setNewOrder({...newOrder, items})
                  }} className="text-red-500 hover:underline">X</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddItem} className="text-blue-600 hover:underline">+ Agregar item</button>
          
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">Crear pedido</button>
        </form>
      )}

      <div className="space-y-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-lg">Pedido #{order.order_number}</h3>
                <p className="text-sm text-gray-600">Mesa: {order.table_number || 'N/A'} | Cliente: {order.customer_name || 'Anónimo'}</p>
                <p className="text-sm text-gray-600">Estado: <span className="font-medium capitalize">{order.status}</span></p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">${order.total.toFixed(2)}</p>
                <div className="flex gap-2 mt-2">
                  {order.status === 'pending' && (
                    <button onClick={() => handleStatusChange(order.id, 'confirmed')} className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">Confirmar</button>
                  )}
                  {order.status === 'confirmed' && (
                    <button onClick={() => handleStatusChange(order.id, 'preparing')} className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600">Preparar</button>
                  )}
                  {order.status === 'preparing' && (
                    <button onClick={() => handleStatusChange(order.id, 'ready')} className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">Listo</button>
                  )}
                  {order.status === 'ready' && (
                    <button onClick={() => handleStatusChange(order.id, 'served')} className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">Servido</button>
                  )}
                  {order.status === 'served' && (
                    <button onClick={() => handleStatusChange(order.id, 'completed')} className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600">Completar</button>
                  )}
                  {!['completed', 'cancelled'].includes(order.status) && (
                    <button onClick={() => handleCancel(order.id)} className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">Cancelar</button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <h4 className="text-sm font-medium text-gray-700">Items:</h4>
              <ul className="text-sm text-gray-600">
                {order.items?.map(item => (
                  <li key={item.id}>{item.product_name} x{item.quantity} - ${item.total.toFixed(2)}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-400 mt-2">Creado: {new Date(order.created_at).toLocaleString()}</p>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-gray-500">No hay pedidos</p>}
      </div>
    </div>
  )
}
