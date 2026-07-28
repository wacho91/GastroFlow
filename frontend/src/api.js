const BASE_URL = 'http://localhost:8000/api/v1'

let accessToken = localStorage.getItem('access_token') || null
let refreshToken = localStorage.getItem('refresh_token') || null

let onAuthError = null

export function setTokens(access, refresh) {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export function setOnAuthError(callback) {
  onAuthError = callback
}

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token')
  const resp = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  if (!resp.ok) {
    clearTokens()
    if (onAuthError) onAuthError()
    throw new Error('Refresh failed')
  }
  const data = await resp.json()
  setTokens(data.access_token, data.refresh_token)
  return data.access_token
}

async function apiFetch(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  }

  if (accessToken) {
    config.headers['Authorization'] = `Bearer ${accessToken}`
  }

  let resp = await fetch(`${BASE_URL}${url}`, config)

  if (resp.status === 401 && refreshToken) {
    try {
      const newToken = await refreshAccessToken()
      config.headers['Authorization'] = `Bearer ${newToken}`
      resp = await fetch(`${BASE_URL}${url}`, config)
    } catch (e) {
      throw new Error('Authentication failed')
    }
  }

  if (!resp.ok) {
    const errorBody = await resp.text()
    let message = `HTTP ${resp.status}`
    try {
      const errJson = JSON.parse(errorBody)
      message = errJson.detail || message
    } catch (e) {
      console.log("Parse error ignored");
    }
    throw new Error(message)
  }

  if (resp.status === 204) return null

  return resp.json()
}

export const authAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  refresh: () =>
    apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    })
}

export const restaurantAPI = {
  list: () => apiFetch('/restaurants'),
  get: (id) => apiFetch(`/restaurants/${id}`),
  create: (data) =>
    apiFetch('/restaurants', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (id, data) =>
    apiFetch(`/restaurants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (id) =>
    apiFetch(`/restaurants/${id}`, { method: 'DELETE' })
}

export const userAPI = {
  list: (tenantId) => apiFetch(`/restaurants/${tenantId}/users`),
  get: (userId) => apiFetch(`/users/${userId}`),
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/users`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (userId, data) =>
    apiFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (userId) =>
    apiFetch(`/users/${userId}`, { method: 'DELETE' })
}

export const categoryAPI = {
  list: (tenantId) => apiFetch(`/restaurants/${tenantId}/categories`),
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/categories`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (categoryId, data) =>
    apiFetch(`/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (categoryId) =>
    apiFetch(`/categories/${categoryId}`, { method: 'DELETE' })
}

export const productAPI = {
  list: (tenantId, categoryId) => {
    let suffix = ''
    if (categoryId) suffix = `?category_id=${categoryId}`
    return apiFetch(`/restaurants/${tenantId}/products${suffix}`)
  },
  get: (productId) => apiFetch(`/products/${productId}`),
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/products`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (productId, data) =>
    apiFetch(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (productId) =>
    apiFetch(`/products/${productId}`, { method: 'DELETE' })
}

export const orderAPI = {
  list: (tenantId, status) => {
    let suffix = ''
    if (status) suffix = `?status=${status}`
    return apiFetch(`/restaurants/${tenantId}/orders${suffix}`)
  },
  get: (orderId) => apiFetch(`/orders/${orderId}`),
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/orders`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (orderId, data) =>
    apiFetch(`/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  delete: (orderId) =>
    apiFetch(`/orders/${orderId}`, { method: 'DELETE' }),
  updateItem: (itemId, data) =>
    apiFetch(`/order-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
}

export const inventoryAPI = {
  list: (tenantId, productId) => {
    let suffix = ''
    if (productId) suffix = `?product_id=${productId}`
    return apiFetch(`/restaurants/${tenantId}/inventory${suffix}`)
  },
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/inventory`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
}

export const invoiceAPI = {
  list: (tenantId) => apiFetch(`/restaurants/${tenantId}/invoices`),
  create: (tenantId, data) =>
    apiFetch(`/restaurants/${tenantId}/invoices`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
}

export const auditLogAPI = {
  list: (tenantId, entityType) => {
    let suffix = ''
    if (entityType) suffix = `?entity_type=${entityType}`
    return apiFetch(`/restaurants/${tenantId}/audit-logs${suffix}`)
  }
}

export function createWebSocket(tenantId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/api/ws/${tenantId}?token=${accessToken}`
  return new WebSocket(wsUrl)
}

export const handleApiError = (error) => {
  if (error.message === 'Authentication failed') {
    clearTokens()
    window.location.href = '/login'
  }
  return error.message || 'Error de conexión'
}