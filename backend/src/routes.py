import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
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
    return user.restaurant

# ------------------------------------------------------------------
# Router y WebSockets
# ------------------------------------------------------------------
router = APIRouter()

# === GESTOR DE WEBSOCKETS PARA TIEMPO REAL ===
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            if websocket in self.active_connections[tenant_id]:
                self.active_connections[tenant_id].remove(websocket)

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        if tenant_id in self.active_connections:
            for connection in self.active_connections[tenant_id]:
                await connection.send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await manager.connect(websocket, tenant_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_id)

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

    user.last_login = datetime.utcnow()
    await db.flush()

    access_token = create_access_token(data={
        "sub": user.id,
        "tenant": user.tenant_id,
        "full_name": user.full_name,
        "role": user.role
    })
    refresh_token = create_refresh_token(data={"sub": user.id, "tenant": user.tenant_id})

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

    stored_token.is_revoked = 1

    result_user = await db.execute(select(User).where(User.id == user_id))
    user = result_user.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token(data={
        "sub": user.id,
        "tenant": user.tenant_id,
        "full_name": user.full_name,
        "role": user.role
    })
    new_refresh_token = create_refresh_token(data={"sub": user.id, "tenant": user.tenant_id})

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
   
    product_data = data.dict()
    if not product_data.get('category_id'):
        product_data['category_id'] = None
       
    product = Product(tenant_id=tenant_id, **product_data)
    db.add(product)
    await db.flush()
    return product

@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, data: ProductUpdate, db: AsyncSession = Depends(get_session),
                         current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
   
    update_data = data.dict(exclude_unset=True)
    if 'category_id' in update_data and not update_data['category_id']:
        update_data['category_id'] = None
       
    for field, value in update_data.items():
        setattr(product, field, value)
    await db.flush()
    return product

@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, db: AsyncSession = Depends(get_session),
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
   
    query = select(Order).options(selectinload(Order.items)).where(Order.tenant_id == tenant_id)
    if status:
        status_list = status.split(',')
        query = query.where(Order.status.in_(status_list))
       
    result = await db.execute(query.order_by(Order.created_at.desc()))
    return result.scalars().all()

@router.post("/restaurants/{tenant_id}/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(tenant_id: str, data: OrderCreate, db: AsyncSession = Depends(get_session),
                       current_user: User = Depends(get_current_user)):
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
   
    # 0. Calcular el número de pedido consecutivo
    result_max = await db.execute(select(func.max(Order.order_number)).where(Order.tenant_id == tenant_id))
    max_num = result_max.scalar()
    next_num = (max_num or 0) + 1
   
    # 1. Crear la orden principal
    order_data = data.dict(exclude={'items'})
    order = Order(
        **order_data,
        tenant_id=tenant_id,
        created_by=current_user.id,
        status='pending',
        order_number=next_num  # <--- ASIGNAMOS EL NÚMERO AQUÍ
    )
    db.add(order)
    await db.flush() # Para obtener el ID de la orden
   
    # 2. Crear los items de la orden y calcular totales
    subtotal = 0.0
    tax_total = 0.0
   
    for idx, item_data in enumerate(data.items):
        product = await db.get(Product, item_data.product_id)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item_data.product_id} not found")
           
        unit_price = item_data.unit_price if item_data.unit_price else product.price
        quantity = item_data.quantity
        tax_percentage = product.tax_percentage if hasattr(product, 'tax_percentage') else 0.0
       
        item_subtotal = unit_price * quantity
        item_tax = item_subtotal * (tax_percentage / 100)
        item_total = item_subtotal + item_tax
       
        order_item = OrderItem(
            tenant_id=tenant_id,
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            quantity=quantity,
            unit_price=unit_price,
            tax_percentage=tax_percentage,
            tax_amount=item_tax,
            subtotal=item_subtotal,
            total=item_total,
            sort_order=idx,
            status='pending'
        )
        db.add(order_item)
       
        subtotal += item_subtotal
        tax_total += item_tax
       
    # 3. Actualizar totales en la orden
    order.subtotal = subtotal
    order.tax_total = tax_total
    order.total = subtotal + tax_total - (order.discount or 0)
    await db.flush()
   
    # 4. VOLVER A CONSULTAR LA ORDEN CON SUS RELACIONES
    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    )
    final_order = result.scalars().first()
   
    # 5. ENVIAR SEÑAL EN TIEMPO REAL A LA COCINA (WEBSOCKET)
    await manager.broadcast_to_tenant(tenant_id, {"event": "new_order", "order_id": str(final_order.id)})
   
    return final_order