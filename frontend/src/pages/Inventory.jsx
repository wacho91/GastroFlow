import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { inventoryAPI, productAPI } from '../api'
import toast from 'react-hot-toast'

export default function Inventory() {
  const { user } = useAuth()
  const [movements, setMovements] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ product_id: '', movement_type: 'in', quantity: 1, unit_cost: 0, description: '' })
  const [filterProduct, setFilterProduct] = useState('')

  const loadMovements = async () => {
    if (!user?.tenantId) return
    try {
      const data = await inventoryAPI.list(user.tenantId, filterProduct || undefined)
      setMovements(data)
    } catch (err) {
      toast.error('Error al cargar movimientos')
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
    loadMovements()
    loadProducts()
  }, [user, filterProduct])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await inventoryAPI.create(user.tenantId, form)
      toast.success('Movimiento registrado')
      setForm({ product_id: '', movement_type: 'in', quantity: 1, unit_cost: 0, description: '' })
      setShowForm(false)
      loadMovements()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventario (Kardex)</h1>
        <div className="flex gap-2">
          <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="border p-2 rounded">
            <option value="">Todos los productos</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            {showForm ? 'Cancelar' : 'Nuevo movimiento'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select value={form.product_id} onChange={e => setForm({...form, product_id: e.target.value})} required className="border p-2 rounded">
              <option value="">Seleccionar producto</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
              ))}
            </select>
            <select value={form.movement_type} onChange={e => setForm({...form, movement_type: e.target.value})} required className="border p-2 rounded">
              <option value="in">Entrada</option>
              <option value="out">Salida</option>
              <option value="transfer">Transferencia</option>
              <option value="adjustment">Ajuste</option>
            </select>
            <input type="number" placeholder="Cantidad" step="0.01" min="0.01" value={form.quantity} onChange={e => setForm({...form, quantity: parseFloat(e.target.value) || 1})} required className="border p-2 rounded" />
            <input type="number" placeholder="Costo unitario" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value) || 0})} className="border p-2 rounded" />
          </div>
          <textarea placeholder="Descripción" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="border p-2 rounded w-full" rows="2" />
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">Registrar movimiento</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo unitario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {movements.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4 whitespace-nowrap">{m.product_name}</td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">{m.movement_type}</td>
                <td className="px-6 py-4 whitespace-nowrap">{m.quantity}</td>
                <td className="px-6 py-4 whitespace-nowrap">${m.unit_cost.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap">${m.total_cost.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr><td colSpan="6" className="text-center py-4 text-gray-500">No hay movimientos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
