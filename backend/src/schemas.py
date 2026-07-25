from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

# ------------------------------------------------------------------
# Auth Schemas
# ------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

# ------------------------------------------------------------------
# Restaurant Schemas
# ------------------------------------------------------------------
class RestaurantCreate(BaseModel):
    name: str = Field(..., max_length=200)
    legal_name: str = Field(..., max_length=200)
    tax_id: str = Field(..., max_length=50)
    address: str = Field(..., max_length=300)
    phone: Optional[str] = Field(None, max_length=30)
    email: Optional[EmailStr] = None
    country: str = Field("CO", max_length=2)
    currency: str = Field("COP", max_length=5)
    timezone: str = Field("America/Bogota", max_length=50)
    dian_environment: str = Field("test", max_length=20)
    dian_resolution_number: Optional[str] = None
    dian_resolution_date: Optional[str] = None
    dian_resolution_prefix: Optional[str] = None
    dian_resolution_from: Optional[int] = None
    dian_resolution_to: Optional[int] = None

class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    dian_environment: Optional[str] = None
    dian_resolution_number: Optional[str] = None
    dian_resolution_date: Optional[str] = None
    dian_resolution_prefix: Optional[str] = None
    dian_resolution_from: Optional[int] = None
    dian_resolution_to: Optional[int] = None

class RestaurantResponse(BaseModel):
    id: str
    name: str
    legal_name: str
    tax_id: str
    address: str
    phone: Optional[str]
    email: Optional[str]
    country: str
    currency: str
    timezone: str
    dian_environment: str
    dian_resolution_number: Optional[str]
    dian_resolution_date: Optional[str]
    dian_resolution_prefix: Optional[str]
    dian_resolution_from: Optional[int]
    dian_resolution_to: Optional[int]
    current_invoice_number: int
    is_active: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# User Schemas
# ------------------------------------------------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., max_length=200)
    role: str = Field(..., pattern="^(admin|waiter|cashier|cook|supervisor)$")

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[int] = None

class UserResponse(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    role: str
    is_active: int
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Category Schemas
# ------------------------------------------------------------------
class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    sort_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[int] = None

class CategoryResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str]
    sort_order: int
    is_active: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Product Schemas
# ------------------------------------------------------------------
class ProductCreate(BaseModel):
    category_id: Optional[str] = None
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    type: str = Field("sale", pattern="^(sale|ingredient)$")
    unit: str = Field("unit", max_length=20)
    price: float = 0.0
    cost_price: float = 0.0
    tax_percentage: float = 0.0
    stock: float = 0.0
    min_stock: float = 0.0
    max_stock: Optional[float] = None

class ProductUpdate(BaseModel):
    category_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    type: Optional[str] = None
    unit: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    tax_percentage: Optional[float] = None
    stock: Optional[float] = None
    min_stock: Optional[float] = None
    max_stock: Optional[float] = None
    is_active: Optional[int] = None

class ProductIngredientResponse(BaseModel):
    id: str
    ingredient_id: str
    ingredient_name: str  # computed from relation
    quantity: float
    unit: str

class ProductResponse(BaseModel):
    id: str
    tenant_id: str
    category_id: Optional[str]
    name: str
    description: Optional[str]
    sku: Optional[str]
    barcode: Optional[str]
    type: str
    unit: str
    price: float
    cost_price: float
    tax_percentage: float
    stock: float
    min_stock: float
    max_stock: Optional[float]
    is_active: int
    created_at: datetime
    updated_at: datetime
    ingredients: List[ProductIngredientResponse] = []

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Order Schemas
# ------------------------------------------------------------------
class OrderItemCreate(BaseModel):
    product_id: str
    quantity: float = 1.0
    unit_price: float
    discount: float = 0.0
    tax_percentage: float = 0.0
    notes: Optional[str] = None
    sort_order: int = 0

class OrderCreate(BaseModel):
    table_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate] = Field(..., min_items=1)

class OrderUpdate(BaseModel):
    table_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    status: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None

class OrderItemResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    discount: float
    tax_percentage: float
    tax_amount: float
    subtotal: float
    total: float
    notes: Optional[str]
    status: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True

class OrderResponse(BaseModel):
    id: str
    tenant_id: str
    order_number: Optional[int]
    table_number: Optional[str]
    customer_name: Optional[str]
    customer_document: Optional[str]
    status: str
    payment_method: Optional[str]
    subtotal: float
    discount: float
    tax_total: float
    total: float
    notes: Optional[str]
    created_by: str
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemResponse]

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Inventory Movement Schemas
# ------------------------------------------------------------------
class InventoryMovementCreate(BaseModel):
    product_id: str
    movement_type: str = Field(..., pattern="^(in|out|transfer|adjustment)$")
    quantity: float
    unit_cost: float = 0.0
    description: Optional[str] = None

class InventoryMovementResponse(BaseModel):
    id: str
    tenant_id: str
    product_id: str
    product_name: str
    movement_type: str
    quantity: float
    unit_cost: float
    total_cost: float
    reference_type: Optional[str]
    reference_id: Optional[str]
    description: Optional[str]
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Invoice Schemas
# ------------------------------------------------------------------
class InvoiceCreate(BaseModel):
    order_id: str
    customer_document: Optional[str] = None
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None

class InvoiceResponse(BaseModel):
    id: str
    tenant_id: str
    order_id: str
    invoice_number: str
    cufe: Optional[str]
    cude: Optional[str]
    dian_status: str
    dian_track_id: Optional[str]
    dian_status_message: Optional[str]
    dian_response_date: Optional[datetime]
    customer_document: Optional[str]
    customer_name: Optional[str]
    customer_address: Optional[str]
    subtotal: float
    discount: float
    tax_total: float
    total: float
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# Audit Log Schemas
# ------------------------------------------------------------------
class AuditLogResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    user_name: str
    action: str
    entity_type: str
    entity_id: Optional[str]
    old_values: Optional[str]
    new_values: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------
# WebSocket Message Schemas
# ------------------------------------------------------------------
class WSMessage(BaseModel):
    event: str  # e.g. "order_update"
    data: dict

# ------------------------------------------------------------------
# Generic Paginated Response
# ------------------------------------------------------------------
class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    size: int
