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

    access_token = create_access_token(data={"sub": user.id, "tenant": user.tenant_id})
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

    access_token = create_access_token(data={"sub": user.id, "tenant": user.tenant_id})
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

# ======================= PRODUCTS =======================

@router.get("/restaurants/{tenant_id}/products", response_model=List[ProductResponse])
async def list_products(tenant_id: str, category_id: Optional[str] = Query(None),
                        db: AsyncSession = Depends(get_session),
                        current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    query = select(Product).where(Product.tenant_id == tenant_id, Product.is_active == 1)
    if category_id:
        query = query.where(Product.category_id == category_id)
    result = await db.execute(query.order_by(Product.name))
    products = result.scalars().all()
    # Cargar ingredientes
    product_ids = [p.id for p in products]
    if product_ids:
        ing_result = await db.execute(
            select(ProductIngredient).where(ProductIngredient.sale_product_id.in_(product_ids))
        )
        ingredients_map = {}
        for ing in ing_result.scalars().all():
            ingredients_map.setdefault(ing.sale_product_id, []).append(ing)
        for p in products:
            p.ingredients = []
            for ing in ingredients_map.get(p.id, []):
                # Obtener nombre del ingrediente
                ing_product = await db.get(Product, ing.ingredient_id)
                p.ingredients.append(ProductIngredientResponse(
                    id=ing.id,
                    ingredient_id=ing.ingredient_id,
                    ingredient_name=ing_product.name if ing_product else "",
                    quantity=ing.quantity,
                    unit=ing.unit
                ))
    return products

@router.post("/restaurants/{tenant_id}/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(tenant_id: str, data: ProductCreate, db: AsyncSession = Depends(get_session),
                         current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    product = Product(tenant_id=tenant_id, **data.dict())
    db.add(product)
    await db.flush()
    return product

@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, db: AsyncSession = Depends(get_session),
                      current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Cargar ingredientes
    ing_result = await db.execute(
        select(ProductIngredient).where(ProductIngredient.sale_product_id == product_id)
    )
    product.ingredients = []
    for ing in ing_result.scalars().all():
        ing_product = await db.get(Product, ing.ingredient_id)
        product.ingredients.append(ProductIngredientResponse(
            id=ing.id,
            ingredient_id=ing.ingredient_id,
            ingredient_name=ing_product.name if ing_product else "",
            quantity=ing.quantity,
            unit=ing.unit
        ))
    return product

@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, data: ProductUpdate, db: AsyncSession = Depends(get_session),
                         current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    for field, value in data.dict(exclude_unset=True).items():
        setattr(product, field, value)
    await db.flush()
    return product

@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_product(product_id: str, db: AsyncSession = Depends(get_session),
                             current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    product.is_active = 0
    await db.flush()

# ======================= ORDERS =======================

@router.get("/restaurants/{tenant_id}/orders", response_model=List[OrderResponse])
async def list_orders(tenant_id: str, status: Optional[str] = Query(None),
                      db: AsyncSession = Depends(get_session),
                      current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    query = select(Order).where(Order.tenant_id == tenant_id)
    if status:
        query = query.where(Order.status == status)
    query = query.order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    # Cargar items para cada orden
    order_ids = [o.id for o in orders]
    if order_ids:
        items_result = await db.execute(
            select(OrderItem).where(OrderItem.order_id.in_(order_ids)).order_by(OrderItem.sort_order)
        )
        items_map = {}
        for item in items_result.scalars().all():
            items_map.setdefault(item.order_id, []).append(item)
        for o in orders:
            o.items = items_map.get(o.id, [])
    return orders

@router.post("/restaurants/{tenant_id}/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(tenant_id: str, data: OrderCreate, db: AsyncSession = Depends(get_session),
                       current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    # Calcular totales
    subtotal = 0.0
    discount_total = 0.0
    tax_total = 0.0
    order_items = []
    for item_data in data.items:
        # Verificar producto existente
        product = await db.get(Product, item_data.product_id)
        if not product or product.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Product {item_data.product_id} not found")
        tax = item_data.unit_price * item_data.quantity * (item_data.tax_percentage / 100)
        subtotal_item = item_data.unit_price * item_data.quantity - item_data.discount
        total_item = subtotal_item + tax
        subtotal += item_data.unit_price * item_data.quantity
        discount_total += item_data.discount
        tax_total += tax
        order_item = OrderItem(
            tenant_id=tenant_id,
            product_id=item_data.product_id,
            product_name=product.name,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            discount=item_data.discount,
            tax_percentage=item_data.tax_percentage,
            tax_amount=tax,
            subtotal=subtotal_item,
            total=total_item,
            notes=item_data.notes,
            sort_order=item_data.sort_order,
            status="pending"
        )
        order_items.append(order_item)

    # Generar número de orden secuencial
    last_order = await db.execute(
        select(func.max(Order.order_number)).where(Order.tenant_id == tenant_id)
    )
    last_number = last_order.scalar() or 0
    order_number = last_number + 1

    total = subtotal - discount_total + tax_total
    order = Order(
        tenant_id=tenant_id,
        order_number=order_number,
        table_number=data.table_number,
        customer_name=data.customer_name,
        customer_document=data.customer_document,
        status="pending",
        subtotal=subtotal,
        discount=discount_total,
        tax_total=tax_total,
        total=total,
        notes=data.notes,
        created_by=current_user.id
    )
    db.add(order)
    await db.flush()  # Para obtener order.id
    for item in order_items:
        item.order_id = order.id
        db.add(item)
    await db.flush()
    order.items = order_items
    return order

@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, db: AsyncSession = Depends(get_session),
                    current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Cargar items
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id).order_by(OrderItem.sort_order)
    )
    order.items = items_result.scalars().all()
    return order

@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, data: OrderUpdate, db: AsyncSession = Depends(get_session),
                       current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Validar cambio de status
    if data.status:
        allowed_transitions = {
            "pending": ["confirmed", "cancelled"],
            "confirmed": ["preparing", "cancelled"],
            "preparing": ["ready", "cancelled"],
            "ready": ["served", "cancelled"],
            "served": ["completed"],
            "cancelled": [],
            "completed": []
        }
        if data.status not in allowed_transitions.get(order.status, []):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Cannot change status from {order.status} to {data.status}")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(order, field, value)
    if data.status == "completed":
        order.completed_at = datetime.utcnow()
    await db.flush()
    return order

@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_order(order_id: str, db: AsyncSession = Depends(get_session),
                       current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if order.status in ("completed", "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order already finalized")
    order.status = "cancelled"
    await db.flush()

# ======================= ORDER ITEMS (individual update) =======================

@router.put("/order-items/{item_id}", response_model=OrderItemResponse)
async def update_order_item(item_id: str, data: dict, db: AsyncSession = Depends(get_session),
                            current_user: User = Depends(get_current_user)):
    # Se permite cambiar status y notes de un item
    result = await db.execute(select(OrderItem).where(OrderItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item or item.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    allowed_fields = {"status", "notes"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(item, field, value)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field {field} not allowed")
    await db.flush()
    return item

# ======================= INVENTORY MOVEMENTS =======================

@router.get("/restaurants/{tenant_id}/inventory", response_model=List[InventoryMovementResponse])
async def list_inventory(tenant_id: str, product_id: Optional[str] = Query(None),
                         db: AsyncSession = Depends(get_session),
                         current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    query = select(InventoryMovement).where(InventoryMovement.tenant_id == tenant_id)
    if product_id:
        query = query.where(InventoryMovement.product_id == product_id)
    query = query.order_by(InventoryMovement.created_at.desc())
    result = await db.execute(query)
    movements = result.scalars().all()
    # Agregar nombre del producto
    for m in movements:
        product = await db.get(Product, m.product_id)
        m.product_name = product.name if product else "Unknown"
    return movements

@router.post("/restaurants/{tenant_id}/inventory", response_model=InventoryMovementResponse, status_code=status.HTTP_201_CREATED)
async def create_inventory_movement(tenant_id: str, data: InventoryMovementCreate,
                                    db: AsyncSession = Depends(get_session),
                                    current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    # Verificar producto
    product = await db.get(Product, data.product_id)
    if not product or product.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    total_cost = data.quantity * data.unit_cost
    movement = InventoryMovement(
        tenant_id=tenant_id,
        product_id=data.product_id,
        movement_type=data.movement_type,
        quantity=data.quantity,
        unit_cost=data.unit_cost,
        total_cost=total_cost,
        description=data.description,
        created_by=current_user.id
    )
    # Actualizar stock del producto
    if data.movement_type == "in":
        product.stock += data.quantity
    elif data.movement_type == "out":
        if product.stock < data.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient stock")
        product.stock -= data.quantity
    # transfer y adjustment se manejan según lógica de negocio
    db.add(movement)
    await db.flush()
    movement.product_name = product.name
    return movement

# ======================= INVOICES =======================

@router.post("/restaurants/{tenant_id}/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(tenant_id: str, data: InvoiceCreate, db: AsyncSession = Depends(get_session),
                         current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    # Obtener orden y verificar que pertenezca al tenant
    order = await db.get(Order, data.order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order must be completed")
    # Generar número de factura automático con prefijo
    restaurant = await db.get(Restaurant, tenant_id)
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    restaurant.current_invoice_number += 1
    invoice_number = f"{restaurant.dian_resolution_prefix or ''}{restaurant.current_invoice_number:010d}"
    invoice = Invoice(
        tenant_id=tenant_id,
        order_id=data.order_id,
        invoice_number=invoice_number,
        customer_document=data.customer_document or order.customer_document,
        customer_name=data.customer_name or order.customer_name,
        customer_address=data.customer_address,
        subtotal=order.subtotal,
        discount=order.discount,
        tax_total=order.tax_total,
        total=order.total,
        created_by=current_user.id,
        dian_status="pending"
    )
    db.add(invoice)
    await db.flush()
    return invoice

@router.get("/restaurants/{tenant_id}/invoices", response_model=List[InvoiceResponse])
async def list_invoices(tenant_id: str, db: AsyncSession = Depends(get_session),
                        current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    result = await db.execute(
        select(Invoice).where(Invoice.tenant_id == tenant_id).order_by(Invoice.created_at.desc())
    )
    return result.scalars().all()

# ======================= AUDIT LOGS =======================

@router.get("/restaurants/{tenant_id}/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(tenant_id: str, entity_type: Optional[str] = Query(None),
                          db: AsyncSession = Depends(get_session),
                          current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    query = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    query = query.order_by(AuditLog.created_at.desc()).limit(100)
    result = await db.execute(query)
    logs = result.scalars().all()
    for log in logs:
        user = await db.get(User, log.user_id)
        log.user_name = user.full_name if user else "Unknown"
    return logs

# ======================= WEBHOOKS / WEBSOCKETS =======================
# Mantenemos conexiones activas para notificaciones de órdenes
active_connections: dict[str, list[WebSocket]] = {}  # tenant_id -> list of WebSocket

@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await websocket.accept()
    if tenant_id not in active_connections:
        active_connections[tenant_id] = []
    active_connections[tenant_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Por ahora solo enviamos confirmación, en producción se procesan mensajes
            await websocket.send_text(f"Received: {data}")
    except WebSocketDisconnect:
        active_connections[tenant_id].remove(websocket)
        if not active_connections[tenant_id]:
            del active_connections[tenant_id]

# Función auxiliar para enviar notificaciones a un tenant
async def notify_tenant(tenant_id: str, message: dict):
    if tenant_id in active_connections:
        for ws in active_connections[tenant_id]:
            try:
                await ws.send_json(message)
            except Exception:
                pass

# ======================= PAGINATED HELPERS (ejemplo) =======================
# Se puede implementar paginación en list endpoints usando Query parameters page y size
# Ejemplo para list_users (comentado)
# @router.get("/restaurants/{tenant_id}/users", response_model=PaginatedResponse)
# async def list_users_paginated(tenant_id: str, page: int = 1, size: int = 10, ...):
#     ...
