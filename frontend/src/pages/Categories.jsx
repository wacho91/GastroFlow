import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { categoryAPI } from '../api'
import toast from 'react-hot-toast'

export default function Categories() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', description: '', sort_order: 0 })
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadCategories = async () => {
    if (!user?.tenantId) return
    try {
      const data = await categoryAPI.list(user.tenantId)
      setCategories(data)
    } catch (err) {
      toast.error('Error al cargar categorías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCategories() }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await categoryAPI.update(editingId, form)
        toast.success('Categoría actualizada')
      } else {
        await categoryAPI.create(user.tenantId, form)
        toast.success('Categoría creada')
      }
      setForm({ name: '', description: '', sort_order: 0 })
      setEditingId(null)
      setShowForm(false)
      loadCategories()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (c) => {
    setForm({ name: c.name, description: c.description || '', sort_order: c.sort_order })
    setEditingId(c.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar categoría?')) return
    try {
      await categoryAPI.delete(id)
      toast.success('Categoría desactivada')
      loadCategories()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categorías</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', description: '', sort_order: 0 }) }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Nueva categoría'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Nombre" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="Orden" type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} className="border p-2 rounded" />
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orden</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {categories.map(c => (
              <tr key={c.id}>
                <td className="px-6 py-4 whitespace-nowrap">{c.name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{c.description || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">{c.sort_order}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                  <button onClick={() => handleEdit(c)} className="text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline">Desactivar</button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan="4" className="text-center py-4 text-gray-500">No hay categorías</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
