import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, ForeignKey,
    UniqueConstraint, CheckConstraint, Index, func, event
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .database import Base


# ------------------------------------------------------------------
# Helper UUID generator
# ------------------------------------------------------------------
def generate_uuid() -> str:
    return str(uuid.uuid4())


# ------------------------------------------------------------------
# Mixin for automatic updated_at (using SQLAlchemy event listeners)
# ------------------------------------------------------------------
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

# Apply event listeners to all models inheriting from Base
@event.listens_for(Base, 'before_insert', propagate=True)
def set_created_at(mapper, connection, target):
    if hasattr(target, 'created_at') and target.created_at is None:
        target.created_at = datetime.utcnow()
    if hasattr(target, 'updated_at') and target.updated_at is None:
        target.updated_at = datetime.utcnow()

@event.listens_for(Base, 'before_update', propagate=True)
def set_updated_at(mapper, connection, target):
    if hasattr(target, 'updated_at'):
        target.updated_at = datetime.utcnow()


# ------------------------------------------------------------------
# Restaurants (tenants)
# ------------------------------------------------------------------
class Restaurant(Base, TimestampMixin):
    __tablename__ = 'restaurants'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    tax_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=True)
    email: Mapped[str] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(2), default='CO', nullable=False)
    currency: Mapped[str] = mapped_column(String(5), default='COP', nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default='America/Bogota', nullable=False)
    dian_environment: Mapped[str] = mapped_column(String(20), default='test', nullable=False)
    dian_resolution_number: Mapped[str] = mapped_column(String(50), nullable=True)
    dian_resolution_date: Mapped[str] = mapped_column(String(20), nullable=True)
    dian_resolution_prefix: Mapped[str] = mapped_column(String(10), nullable=True)
    dian_resolution_from: Mapped[int] = mapped_column(Integer, nullable=True)
    dian_resolution_to: Mapped[int] = mapped_column(Integer, nullable=True)
    current_invoice_number: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    # Relationships
    users = relationship("User", back_populates="restaurant", cascade="all, delete-orphan")
    product_categories = relationship("ProductCategory", back_populates="restaurant", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="restaurant", cascade="all, delete-orphan")
    product_ingredients = relationship("ProductIngredient", back_populates="restaurant", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="restaurant", cascade="all, delete-orphan")
    order_items = relationship("OrderItem", back_populates="restaurant", cascade="all, delete-orphan")
    inventory_movements = relationship("InventoryMovement", back_populates="restaurant", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="restaurant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="restaurant", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="restaurant", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "dian_environment IN ('test', 'production')",
            name="ck_restaurant_dian_environment"
        ),
    )


# ------------------------------------------------------------------
# Users
# ------------------------------------------------------------------
class User(Base, TimestampMixin):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    email: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    last_login: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    restaurant = relationship("Restaurant", back_populates="users")
    orders_created = relationship("Order", back_populates="created_by_user", foreign_keys="[Order.created_by]")
    inventory_movements = relationship("InventoryMovement", back_populates="created_by_user")
    invoices_created = relationship("Invoice", back_populates="created_by_user", foreign_keys="[Invoice.created_by]")
    audit_logs = relationship("AuditLog", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'email', name='uq_user_tenant_email'),
        CheckConstraint(
            "role IN ('admin', 'waiter', 'cashier', 'cook', 'supervisor')",
            name="ck_user_role"
        ),
    )


# ------------------------------------------------------------------
# Product Categories
# ------------------------------------------------------------------
class ProductCategory(Base, TimestampMixin):
    __tablename__ = 'product_categories'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    restaurant = relationship("Restaurant", back_populates="product_categories")
    products = relationship("Product", back_populates="category")


# ------------------------------------------------------------------
# Products
# ------------------------------------------------------------------
class Product(Base, TimestampMixin):
    __tablename__ = 'products'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    category_id: Mapped[str] = mapped_column(String(36), ForeignKey('product_categories.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    sku: Mapped[str] = mapped_column(String(50), nullable=True)
    barcode: Mapped[str] = mapped_column(String(50), nullable=True)
    type: Mapped[str] = mapped_column(String(20), default='sale', nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default='unit', nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0.0)
    cost_price: Mapped[float] = mapped_column(Float, default=0.0)
    tax_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    stock: Mapped[float] = mapped_column(Float, default=0.0)
    min_stock: Mapped[float] = mapped_column(Float, default=0.0)
    max_stock: Mapped[float] = mapped_column(Float, nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, default=1)

    restaurant = relationship("Restaurant", back_populates="products")
    category = relationship("ProductCategory", back_populates="products")
    ingredients_for = relationship(
        "ProductIngredient",
        back_populates="sale_product",
        foreign_keys="[ProductIngredient.sale_product_id]",
        cascade="all, delete-orphan"
    )
    used_as_ingredient = relationship(
        "ProductIngredient",
        back_populates="ingredient",
        foreign_keys="[ProductIngredient.ingredient_id]"
    )
    order_items = relationship("OrderItem", back_populates="product")
    inventory_movements = relationship("InventoryMovement", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "type IN ('sale', 'ingredient')",
            name="ck_product_type"
        ),
        Index('idx_products_tenant_barcode', 'tenant_id', 'barcode'),
        Index('idx_products_tenant_sku', 'tenant_id', 'sku'),
    )


# ------------------------------------------------------------------
# Product Ingredients
# ------------------------------------------------------------------
class ProductIngredient(Base):
    __tablename__ = 'product_ingredients'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    sale_product_id: Mapped[str] = mapped_column(String(36), ForeignKey('products.id'), nullable=False)
    ingredient_id: Mapped[str] = mapped_column(String(36), ForeignKey('products.id'), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    restaurant = relationship("Restaurant", back_populates="product_ingredients")
    sale_product = relationship("Product", back_populates="ingredients_for", foreign_keys=[sale_product_id])
    ingredient = relationship("Product", back_populates="used_as_ingredient", foreign_keys=[ingredient_id])

    __table_args__ = (
        UniqueConstraint('tenant_id', 'sale_product_id', 'ingredient_id', name='uq_product_ingredient'),
    )


# ------------------------------------------------------------------
# Orders
# ------------------------------------------------------------------
class Order(Base, TimestampMixin):
    __tablename__ = 'orders'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    order_number: Mapped[int] = mapped_column(Integer, nullable=True)  # auto-generated by trigger or application
    table_number: Mapped[str] = mapped_column(String(20), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=True)
    customer_document: Mapped[str] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='pending', nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_total: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    restaurant = relationship("Restaurant", back_populates="orders")
    created_by_user = relationship("User", back_populates="orders_created", foreign_keys=[created_by])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'order_number', name='uq_order_number'),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled', 'completed')",
            name="ck_order_status"
        ),
        CheckConstraint(
            "payment_method IN ('cash', 'card', 'transfer', 'other') OR payment_method IS NULL",
            name="ck_order_payment_method"
        ),
        Index('idx_orders_tenant_status', 'tenant_id', 'status'),
    )


# ------------------------------------------------------------------
# Order Items
# ------------------------------------------------------------------
class OrderItem(Base):
    __tablename__ = 'order_items'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey('orders.id'), nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey('products.id'), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='pending', nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    restaurant = relationship("Restaurant", back_populates="order_items")
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')",
            name="ck_order_item_status"
        ),
        Index('idx_order_items_tenant_order', 'tenant_id', 'order_id'),
    )


# ------------------------------------------------------------------
# Inventory Movements (Kardex)
# ------------------------------------------------------------------
class InventoryMovement(Base):
    __tablename__ = 'inventory_movements'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey('products.id'), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False)
    reference_type: Mapped[str] = mapped_column(String(30), nullable=True)
    reference_id: Mapped[str] = mapped_column(String(36), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    restaurant = relationship("Restaurant", back_populates="inventory_movements")
    product = relationship("Product", back_populates="inventory_movements")
    created_by_user = relationship("User", back_populates="inventory_movements")

    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('in', 'out', 'transfer', 'adjustment')",
            name="ck_movement_type"
        ),
        Index('idx_inventory_tenant_product', 'tenant_id', 'product_id'),
        Index('idx_inventory_reference', 'tenant_id', 'reference_type', 'reference_id'),
    )


# ------------------------------------------------------------------
# Invoices (Electronic Invoicing for DIAN)
# ------------------------------------------------------------------
class Invoice(Base, TimestampMixin):
    __tablename__ = 'invoices'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey('orders.id'), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False)
    cufe: Mapped[str] = mapped_column(String(200), nullable=True)
    cude: Mapped[str] = mapped_column(String(200), nullable=True)
    xml_signed: Mapped[str] = mapped_column(Text, nullable=True)
    xml_response: Mapped[str] = mapped_column(Text, nullable=True)
    dian_status: Mapped[str] = mapped_column(String(20), default='pending', nullable=False)
    dian_track_id: Mapped[str] = mapped_column(String(100), nullable=True)
    dian_status_message: Mapped[str] = mapped_column(Text, nullable=True)
    dian_response_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    customer_document: Mapped[str] = mapped_column(String(50), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=True)
    customer_address: Mapped[str] = mapped_column(String(300), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_total: Mapped[float] = mapped_column(Float, nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)

    restaurant = relationship("Restaurant", back_populates="invoices")
    order = relationship("Order", back_populates="invoices")
    created_by_user = relationship("User", back_populates="invoices_created", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint('tenant_id', 'invoice_number', name='uq_invoice_number'),
        CheckConstraint(
            "dian_status IN ('pending', 'sent', 'accepted', 'rejected', 'cancelled')",
            name="ck_dian_status"
        ),
        Index('idx_invoices_tenant_track', 'tenant_id', 'dian_track_id'),
    )


# ------------------------------------------------------------------
# Audit Log
# ------------------------------------------------------------------
class AuditLog(Base):
    __tablename__ = 'audit_log'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=True)
    old_values: Mapped[str] = mapped_column(Text, nullable=True)  # JSON
    new_values: Mapped[str] = mapped_column(Text, nullable=True)  # JSON
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    restaurant = relationship("Restaurant", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index('idx_audit_tenant_entity', 'tenant_id', 'entity_type', 'entity_id'),
        Index('idx_audit_tenant_user', 'tenant_id', 'user_id'),
    )


# ------------------------------------------------------------------
# Refresh Tokens (JWT session management)
# ------------------------------------------------------------------
class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey('restaurants.id'), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_revoked: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    restaurant = relationship("Restaurant", back_populates="refresh_tokens")
    user = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        Index('idx_refresh_token_hash', 'token_hash'),
        Index('idx_refresh_tenant_expires', 'tenant_id', 'expires_at'),
    )
