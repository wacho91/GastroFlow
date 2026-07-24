import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { userAPI } from '../api'
import toast from 'react-hot-toast'

export default function Users() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'waiter' })
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadUsers = async () => {
    if (!user?.tenantId) return
    try {
      const data = await userAPI.list(user.tenantId)
      setUsers(data)
    } catch (err) {
      toast.error('Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await userAPI.update(editingId, form)
        toast.success('Usuario actualizado')
      } else {
        await userAPI.create(user.tenantId, form)
        toast.success('Usuario creado')
      }
      setForm({ email: '', password: '', full_name: '', role: 'waiter' })
      setEditingId(null)
      setShowForm(false)
      loadUsers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (u) => {
    setForm({ email: u.email, password: '', full_name: u.full_name, role: u.role })
    setEditingId(u.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar usuario?')) return
    try {
      await userAPI.delete(id)
      toast.success('Usuario desactivado')
      loadUsers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ email: '', password: '', full_name: '', role: 'waiter' }) }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="Nombre completo" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required className="border p-2 rounded" />
            <input placeholder="Contraseña" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editingId} className="border p-2 rounded" />
            <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="border p-2 rounded">
              <option value="admin">Admin</option>
              <option value="waiter">Mesero</option>
              <option value="cashier">Cajero</option>
              <option value="cook">Cocinero</option>
              <option value="supervisor">Supervisor</option>
            </select>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activo</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map(u => (
              <tr key={u.id}>
                <td className="px-6 py-4 whitespace-nowrap">{u.full_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{u.email}</td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">{u.role}</td>
                <td className="px-6 py-4 whitespace-nowrap">{u.is_active ? '✅' : '❌'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                  <button onClick={() => handleEdit(u)} className="text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:underline">Desactivar</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="5" className="text-center py-4 text-gray-500">No hay usuarios</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
