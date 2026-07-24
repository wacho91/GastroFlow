import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { invoiceAPI, orderAPI } from '../api'
import toast from 'react-hot-toast'

export default function Invoices() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ order_id: '', customer_document: '', customer_name: '', customer_address: '' })

  const loadInvoices = async () => {
    if (!user?.tenantId) return
    try {
      const data = await invoiceAPI.list(user.tenantId)
      setInvoices(data)
    } catch (err) {
      toast.error('Error al cargar facturas')
    } finally {
      setLoading(false)
    }
  }

  const loadOrders = async () => {
    if (!user?.tenantId) return
    try {
      const data = await orderAPI.list(user.tenantId, 'completed')
      setOrders(data)
    } catch {}
  }

  useEffect(() => {
    loadInvoices()
    loadOrders()
  }, [user])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await invoiceAPI.create(user.tenantId, form)
      toast.success('Factura generada')
      setForm({ order_id: '', customer_document: '', customer_name: '', customer_address: '' })
      setShowCreate(false)
      loadInvoices()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Facturación Electrónica</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          {showCreate ? 'Cancelar' : 'Nueva factura'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select value={form.order_id} onChange={e => setForm({...form, order_id: e.target.value})} required className="border p-2 rounded">
              <option value="">Seleccionar pedido completado</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>Pedido #{o.order_number} - ${o.total.toFixed(2)}</option>
              ))}
            </select>
            <input placeholder="Documento cliente" value={form.customer_document} onChange={e => setForm({...form, customer_document: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Nombre cliente" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} className="border p-2 rounded" />
            <input placeholder="Dirección cliente" value={form.customer_address} onChange={e => setForm({...form, customer_address: e.target.value})} className="border p-2 rounded" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">Generar factura</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orden</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado DIAN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="px-6 py-4 whitespace-nowrap">{inv.invoice_number}</td>
                <td className="px-6 py-4 whitespace-nowrap">{inv.order_id}</td>
                <td className="px-6 py-4 whitespace-nowrap">${inv.total.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">{inv.dian_status}</td>
                <td className="px-6 py-4 whitespace-nowrap">{new Date(inv.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan="5" className="text-center py-4 text-gray-500">No hay facturas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
