import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { productAPI } from '../api'
import toast from 'react-hot-toast'

export default function Products() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '', description: '', sku: '', barcode: '', type: 'sale',
    unit: 'unit', price: 0, cost_price: 0, tax_percentage: 0,
    stock: 0, min_stock: 0, max_stock: null, category_id: ''
  })
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadProducts = async () => {
    if (!user?.tenantId) return
    try {
      const data = await productAPI.list(user.tenantId)
      setProducts(data)
    } catch (err) {
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProducts() }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await productAPI.update(editingId, form)
        toast.success('Producto actualizado')
      } else {
        await productAPI.create(user.tenantId, form)
        toast.success('Producto creado')
      }
      setForm({ name: '', description: '', sku: '', barcode: '', type: 'sale', unit: 'unit', price: 0, cost_price: 0, tax_percentage: 0, stock: 0, min_stock: 0, max_stock: null, category_id: '' })
      setEditingId(null)
      setShowForm(false)
      loadProducts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (p) => {
    setForm({
      name: p.name, description: p.description || '', sku: p.sku || '', barcode: p.barcode || '',
      type: p.type, unit: p.unit, price: p.price, cost_price: p.cost_price,
      tax_percentage: p.tax_percentage, stock: p.stock, min_stock: p.min_stock,
      max_stock: p.max_stock, category_id: p.category_id || ''
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar producto?')) return
    try {
      await productAPI.delete(id)
      toast.success('Producto desactivado')
      loadProducts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', description: '', sku: '', barcode: '', type: 'sale', unit: 'unit', price: 0, cost_price: 0, tax_percentage: 0, stock: 0, min_stock: 0, max_stock: null, category_id: '' }) }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Nuevo producto'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="Nombre" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="SKU" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Código de barras" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Precio" type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value) || 0})} required className="border p-2 rounded" />
            <input placeholder="Costo" type="number" step="0.01" value={form.cost_price} onChange={e => setForm({...form, cost_price: parseFloat(e.target.value) || 0})} className="border p-2 rounded" />
            <input placeholder="Impuesto %" type="number" step="0.01" value={form.tax_percentage} onChange={e => setForm({...form, tax_percentage: parseFloat(e.target.value) || 0})} className="border p-2 rounded" />
            <input placeholder="Stock" type="number" step="0.01" value={form.stock} onChange={e => setForm({...form, stock: parseFloat(e.target.value) || 0})} className="border p-2 rounded" />
            <input placeholder="Stock mínimo" type="number" step="0.01" value={form.min_stock} onChange={e => setForm({...form, min_stock: parseFloat(e.target.value) || 0})} className="border p-2 rounded" />
            <input placeholder="Stock máximo" type="number" step="0.01" value={form.max_stock ?? ''} onChange={e => setForm({...form, max_stock: e.target.value ? parseFloat(e.target.value) : null})} className="border p-2 rounded" />
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="border p-2 rounded">
              <option value="sale">Venta</option>
              <option value="ingredient">Ingrediente</option>
            </select>
            <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="border p-2 rounded">
              <option value="unit">Unidad</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="lt">Litro</option>
              <option value="ml">ml</option>
            </select>
          </div>
          <textarea placeholder="Descripción" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="border p-2 rounded w-full" rows="2" />
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            {editingId ? 'Actualizar' : 'Crear'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map(p => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap">{p.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{p.sku || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">${p.price.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{p.stock}</td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">{p.type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                  <button onClick={() => handleEdit(p)} className="text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">Desactivar</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan="6" className="text-center py-4 text-gray-500">No hay productos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
