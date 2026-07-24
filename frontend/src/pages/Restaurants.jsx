import { useState, useEffect } from 'react'
import { restaurantAPI } from '../api'
import toast from 'react-hot-toast'

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', legal_name: '', tax_id: '', address: '' })
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadRestaurants = async () => {
    try {
      const data = await restaurantAPI.list()
      setRestaurants(data)
    } catch (err) {
      toast.error('Error al cargar restaurantes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRestaurants() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await restaurantAPI.update(editingId, form)
        toast.success('Restaurante actualizado')
      } else {
        await restaurantAPI.create(form)
        toast.success('Restaurante creado')
      }
      setForm({ name: '', legal_name: '', tax_id: '', address: '' })
      setEditingId(null)
      setShowForm(false)
      loadRestaurants()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (r) => {
    setForm({ name: r.name, legal_name: r.legal_name, tax_id: r.tax_id, address: r.address })
    setEditingId(r.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar restaurante?')) return
    try {
      await restaurantAPI.delete(id)
      toast.success('Restaurante desactivado')
      loadRestaurants()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Restaurantes</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', legal_name: '', tax_id: '', address: '' }) }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Nuevo restaurante'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Nombre" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="Razón social" value={form.legal_name} onChange={e => setForm({...form, legal_name: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="NIT" value={form.tax_id} onChange={e => setForm({...form, tax_id: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="Dirección" value={form.address} onChange={e => setForm({...form, address: e.target.value})} required className="border p-2 rounded" />
          </div>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIT</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dirección</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {restaurants.map(r => (
              <tr key={r.id}>
                <td className="px-6 py-4 whitespace-nowrap">{r.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{r.tax_id}</td>
                <td className="px-6 py-4 whitespace-nowrap">{r.address}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                  <button onClick={() => handleEdit(r)} className="text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline">Desactivar</button>
                </td>
              </tr>
            ))}
            {restaurants.length === 0 && (
              <tr><td colSpan="4" className="text-center py-4 text-gray-500">No hay restaurantes registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
