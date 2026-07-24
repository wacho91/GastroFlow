import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { auditLogAPI } from '../api'
import toast from 'react-hot-toast'

export default function AuditLogs() {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEntity, setFilterEntity] = useState('')

  const loadLogs = async () => {
    if (!user?.tenantId) return
    try {
      const data = await auditLogAPI.list(user.tenantId, filterEntity || undefined)
      setLogs(data)
    } catch (err) {
      toast.error('Error al cargar logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs() }, [user, filterEntity])

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Registros de Auditoría</h1>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="border p-2 rounded">
          <option value="">Todos los tipos</option>
          <option value="order">Pedido</option>
          <option value="product">Producto</option>
          <option value="user">Usuario</option>
          <option value="restaurant">Restaurante</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.map(log => (
              <tr key={log.id}>
                <td className="px-6 py-4 whitespace-nowrap">{log.user_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{log.action}</td>
                <td className="px-6 py-4 whitespace-nowrap">{log.entity_type}</td>
                <td className="px-6 py-4 whitespace-nowrap">{log.entity_id || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan="5" className="text-center py-4 text-gray-500">No hay registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
