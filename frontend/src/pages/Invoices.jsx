import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { invoiceAPI, orderAPI } from '../api'
import toast from 'react-hot-toast'

export default function Invoices() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState('')
  const [customerDoc, setCustomerDoc] = useState('')

  const loadData = async () => {
    if (!user?.tenantId) return
    try {
      const [inv, ord] = await Promise.all([
        invoiceAPI.list(user.tenantId),
        orderAPI.list(user.tenantId)
      ])
      setInvoices(inv)
      setOrders(ord)
    } catch (err) {
      toast.error('Error al cargar datos de facturación')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [user])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!selectedOrder) return toast.error('Selecciona una orden para facturar')
    try {
      await invoiceAPI.create(user.tenantId, {
        order_id: selectedOrder,
        customer_document: customerDoc
      })
      toast.success('Factura generada y enviada a la DIAN (Simulado)')
      setShowForm(false)
      setSelectedOrder('')
      setCustomerDoc('')
      loadData()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handlePrint = (invoice) => {
    const order = orders.find(o => o.id === invoice.order_id)
   
    const itemsHtml = order && order.items ? order.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name}</td>
        <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${item.quantity}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">$${Math.round(item.unit_price)}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">$${Math.round(item.total)}</td>
      </tr>
    `).join('') : '<tr><td colspan="4">No items</td></tr>'

    const htmlContent = `
      <html>
        <head>
          <title>Factura #${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            h1 { margin: 0; color: #D97706; }
            h2 { margin: 0; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f4f4f4; text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            .totals { margin-top: 20px; text-align: right; }
            .totals p { margin: 5px 0; font-size: 16px; }
            .cufe { margin-top: 40px; font-size: 10px; word-break: break-all; color: #666; border-top: 1px dashed #ccc; padding-top: 10px; text-align: center; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Sabor & Brasa</h1>
              <p>NIT: 900123456-7</p>
              <p>Factura Electrónica de Venta</p>
            </div>
            <div style="text-align: right;">
              <h2>Factura #${invoice.invoice_number}</h2>
              <p>Fecha: ${new Date(invoice.created_at).toLocaleString()}</p>
              <p>Cliente: ${invoice.customer_name || 'Consumidor Final'}</p>
              <p>Doc: ${invoice.customer_document || 'N/A'}</p>
            </div>
          </div>
         
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Producto</th>
                <th style="text-align: center;">Cant.</th>
                <th style="text-align: right;">V. Unit</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <p>Subtotal: $${Math.round(invoice.subtotal)}</p>
            <p>IVA (19%): $${Math.round(invoice.tax_total)}</p>
            <h3>Total: $${Math.round(invoice.total)}</h3>
          </div>

          <div class="cufe">
            <strong>CUFE:</strong> ${invoice.cufe}<br>
            Estado DIAN: ${invoice.dian_status.toUpperCase()}
          </div>

          <div class="footer">
            ¡Gracias por su compra!<br>
            GastroFlow - Sistema de Gestión de Restaurantes
          </div>
        </body>
      </html>
    `;

    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'print-iframe';
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const printWindow = iframe.contentWindow;
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
   
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Facturación Electrónica (DIAN)</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Generar Factura'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Seleccionar Orden a Facturar</label>
            <select
              value={selectedOrder}
              onChange={e => setSelectedOrder(e.target.value)}
              required
              className="border p-2 rounded w-full"
            >
              <option value="">Seleccione una orden...</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  Pedido #{o.order_number} - Total: ${Math.round(o.total)} (Mesa: {o.table_number || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Documento del Cliente (C.C / NIT)</label>
            <input
              placeholder="Ej: 1234567890"
              value={customerDoc}
              onChange={e => setCustomerDoc(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            Facturar Orden
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* BOTÓN DE ACCIONES AHORA ES LO PRIMERO */}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado DIAN</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CUFE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoices.map(inv => (
              <tr key={inv.id}>
                {/* BOTÓN AQUÍ */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handlePrint(inv)}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                  >
                    🖨️ Imprimir
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-bold">{inv.invoice_number}</td>
                <td className="px-6 py-4 whitespace-nowrap">{inv.customer_name || 'Consumidor Final'}</td>
                <td className="px-6 py-4 whitespace-nowrap">${Math.round(inv.total)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs uppercase font-bold ${inv.dian_status === 'accepted' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {inv.dian_status}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={inv.cufe}>
                  {inv.cufe}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan="6" className="text-center py-4 text-gray-500">No hay facturas generadas todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
