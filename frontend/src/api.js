import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import ValidationError

from .database import get_session
from .models import (
    User, Restaurant, ProductCategory, Product, ProductIngredient,
    Order, OrderItem, InventoryMovement, Invoice, AuditLog, RefreshToken
)
from .schemas import (
    LoginRequest, TokenResponse, RefreshRequest,
    RestaurantCreate, RestaurantUpdate, RestaurantResponse,
    UserCreate, UserUpdate, UserResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ProductCreate, ProductUpdate, ProductResponse, ProductIngredientResponse,
    OrderCreate, OrderUpdate, OrderResponse, OrderItemResponse,
    InventoryMovementCreate, InventoryMovementResponse,
    InvoiceCreate, InvoiceResponse,
    AuditLogResponse,
    PaginatedResponse
)

# ------------------------------------------------------------------
# Security and Auth
# ------------------------------------------------------------------
SECRET_KEY = "your-secret-key-here"  # Mejor en variable de entorno
REFRESH_SECRET_KEY = "your-refresh-secret"  # Mejor en variable de entorno
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_session)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None or payload.get("type") != "access":
            raise credentials_exception
    except (JWTError, ValidationError):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

async def get_current_restaurant(user: User = Depends(get_current_user)) -> Restaurant:
    # Se asume que user.tenant_id es el restaurant id
    return user.restaurant  # cargado por relación

# ------------------------------------------------------------------
# Router
# ------------------------------------------------------------------
router = APIRouter()

# ======================= AUTH =======================

@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(User).where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()
    if not user or not pwd_context.verify(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
   
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    # Update last_login
    user.last_login = datetime.utcnow()
    await db.flush()

    # METEMOS EL NOMBRE Y ROL EN EL TOKEN
    access_token = create_access_token(data={
        "sub": user.id,
        "tenant": user.tenant_id,
        "full_name": user.full_name,
        "role": user.role
    })
    refresh_token = create_refresh_token(data={"sub": user.id, "tenant": user.tenant_id})

    # Store refresh token hash
    token_hash = pwd_context.hash(refresh_token)
    refresh_token_obj = RefreshToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(refresh_token_obj)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)

@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_session)):
    try:
        payload = jwt.decode(body.refresh_token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    except (JWTError, ValidationError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Verificar que el token no esté revocado y exista
    token_hash = pwd_context.hash(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked == 0,
            RefreshToken.expires_at > datetime.utcnow()
        )
    )
    stored_token = result.scalar_one_or_none()
    if not stored_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired or revoked")

    # Revocar el token usado (rotación)
    stored_token.is_revoked = 1

    # Obtener usuario
    result_user = await db.execute(select(User).where(User.id == user_id))
    user = result_user.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # METEMOS EL NOMBRE Y ROL EN EL TOKEN REFRESCADO TAMBIÉN
    access_token = create_access_token(data={
        "sub": user.id,
        "tenant": user.tenant_id,
        "full_name": user.full_name,
        "role": user.role
    })
    new_refresh_token = create_refresh_token(data={"sub": user.id, "tenant": user.tenant_id})

    # Almacenar nuevo refresh token
    new_token_hash = pwd_context.hash(new_refresh_token)
    new_token_obj = RefreshToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(new_token_obj)

    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)

# ======================= RESTAURANTS =======================

@router.get("/restaurants", response_model=List[RestaurantResponse])
async def list_restaurants(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Restaurant).where(Restaurant.is_active == 1))
    return result.scalars().all()

@router.get("/restaurants/{restaurant_id}", response_model=RestaurantResponse)
async def get_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    return restaurant

@router.post("/restaurants", response_model=RestaurantResponse, status_code=status.HTTP_201_CREATED)
async def create_restaurant(data: RestaurantCreate, db: AsyncSession = Depends(get_session)):
    # Verificar tax_id único
    result = await db.execute(select(Restaurant).where(Restaurant.tax_id == data.tax_id))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tax ID already exists")
    restaurant = Restaurant(**data.dict())
    db.add(restaurant)
    await db.flush()
    return restaurant

@router.put("/restaurants/{restaurant_id}", response_model=RestaurantResponse)
async def update_restaurant(restaurant_id: str, data: RestaurantUpdate,
                            db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(restaurant, field, value)
    await db.flush()
    return restaurant

@router.delete("/restaurants/{restaurant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def soft_delete_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    restaurant.is_active = 0
    await db.flush()

# ======================= USERS =======================

@router.get("/restaurants/{tenant_id}/users", response_model=List[UserResponse])
async def list_users(tenant_id: str, db: AsyncSession = Depends(get_session),
                     current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.created_at.desc())
    )
    return result.scalars().all()

@router.post("/restaurants/{tenant_id}/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(tenant_id: str, data: UserCreate, db: AsyncSession = Depends(get_session),
                      current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    # Verificar email único por tenant
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.email == data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists in this restaurant")
    user = User(
        tenant_id=tenant_id,
        email=data.email,
        password_hash=pwd_context.hash(data.password),
        full_name=data.full_name,
        role=data.role
    )
    db.add(user)
    await db.flush()
    return user

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_session),
                   current_user: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return user

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, data: UserUpdate, db: AsyncSession = Depends(get_session),
                      current_user: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    update_data = data.dict(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = pwd_context.hash(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.flush()
    return user

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(user_id: str, db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    user.is_active = 0
    await db.flush()

# ======================= CATEGORIES =======================

@router.get("/restaurants/{tenant_id}/categories", response_model=List[CategoryResponse])
async def list_categories(tenant_id: str, db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    result = await db.execute(
        select(ProductCategory).where(
            ProductCategory.tenant_id == tenant_id,
            ProductCategory.is_active == 1
        ).order_by(ProductCategory.sort_order)
    )
    return result.scalars().all()

@router.post("/restaurants/{tenant_id}/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(tenant_id: str, data: CategoryCreate, db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    category = ProductCategory(tenant_id=tenant_id, **data.dict())
    db.add(category)
    await db.flush()
    return category

@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, data: CategoryUpdate, db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductCategory).where(ProductCategory.id == category_id))
    category = result.scalar_one_or_none()
    if not category or category.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    for field, value in data.dict(exclude_unset=True).items():
        setattr(category, field, value)
    await db.flush()
    return category

@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: str, db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ProductCategory).where(ProductCategory.id == category_id))
    category = result.scalar_one_or_none()
    if not category or category.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    category.is_active = 0
    await db.flush()

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