-- ============================================================
-- GastroFlow - Database Schema (SQLite compatible)
-- Diseñado para desarrollo local con SQLite + SQLAlchemy,
-- migrable a PostgreSQL.
-- Versión: 1.0
-- ============================================================

-- ============================================================
-- TABLA: tenants (restaurantes)
-- Almacena la información de cada tenant (restaurante)
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
    id                  TEXT PRIMARY KEY,                     -- UUID generado (tenant_id)
    name                TEXT NOT NULL,                        -- Nombre comercial del restaurante
    legal_name          TEXT NOT NULL,                        -- Razón social (para facturación)
    tax_id              TEXT NOT NULL UNIQUE,                 -- NIT o documento tributario (único)
    address             TEXT NOT NULL,                        -- Dirección del establecimiento
    phone               TEXT,                                -- Teléfono de contacto
    email               TEXT,                                -- Correo electrónico de contacto
    country             TEXT NOT NULL DEFAULT 'CO',          -- Código ISO del país (CO)
    currency            TEXT NOT NULL DEFAULT 'COP',         -- Moneda por defecto (COP)
    timezone            TEXT NOT NULL DEFAULT 'America/Bogota', -- Zona horaria
    dian_environment    TEXT NOT NULL DEFAULT 'test',        -- Entorno DIAN: 'test' o 'production'
    dian_resolution_number TEXT,                             -- Número de resolución DIAN
    dian_resolution_date TEXT,                               -- Fecha de resolución DIAN
    dian_resolution_prefix TEXT,                             -- Prefijo de facturación (ej: SETP)
    dian_resolution_from INTEGER,                            -- Primer número autorizado
    dian_resolution_to INTEGER,                              -- Último número autorizado
    current_invoice_number INTEGER DEFAULT 0,               -- Contador de facturas usado
    is_active           INTEGER NOT NULL DEFAULT 1,          -- 1 = activo, 0 = suspendido
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLA: users (usuarios del sistema)
-- Relacionados con un tenant mediante tenant_id.
-- Almacena información de autenticación y roles.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,                     -- UUID
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,                        -- Correo electrónico (único por tenant)
    password_hash       TEXT NOT NULL,                        -- Hash de la contraseña (bcrypt recomendado)
    full_name           TEXT NOT NULL,                        -- Nombre completo del usuario
    role                TEXT NOT NULL CHECK(role IN ('admin', 'waiter', 'cashier', 'cook', 'supervisor')),
    is_active           INTEGER NOT NULL DEFAULT 1,           -- 1 = activo, 0 = desactivado
    last_login          TEXT,                                 -- Último inicio de sesión
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, email)                                  -- Email único dentro del mismo tenant
);

-- ============================================================
-- TABLA: product_categories (categorías de productos)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_categories (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                        -- Ejemplo: "Entradas", "Bebidas", "Ingredientes"
    description         TEXT,
    sort_order          INTEGER DEFAULT 0,                    -- Orden de visualización
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLA: products (productos/ingredientes)
-- Pueden ser productos vendibles (tipo 'sale') o ingredientes para inventario (tipo 'ingredient')
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id         TEXT REFERENCES product_categories(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    sku                 TEXT,                                -- Código interno (opcional)
    barcode             TEXT,                                -- Código de barras (opcional)
    type                TEXT NOT NULL CHECK(type IN ('sale', 'ingredient')) DEFAULT 'sale',
    unit                TEXT NOT NULL DEFAULT 'unit',        -- Unidad de medida: 'unit', 'kg', 'g', 'l', 'ml', 'oz'
    price               REAL NOT NULL DEFAULT 0.0,           -- Precio de venta (sin impuestos)
    cost_price          REAL NOT NULL DEFAULT 0.0,           -- Costo unitario (para ingredientes)
    tax_percentage      REAL NOT NULL DEFAULT 0.0,           -- Porcentaje de impuesto (IVA generalmente 19% en CO)
    stock               REAL NOT NULL DEFAULT 0.0,           -- Stock actual (para ingredientes)
    min_stock           REAL DEFAULT 0.0,                    -- Stock mínimo para alertas
    max_stock           REAL,                                -- Stock máximo (opcional)
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para búsqueda por código de barras
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(tenant_id, sku);

-- ============================================================
-- TABLA: product_ingredients (composición de productos vendibles)
-- Relación muchos a muchos entre productos vendibles e ingredientes
-- Permite calcular costo de producción y descontar inventario automáticamente
-- ============================================================
CREATE TABLE IF NOT EXISTS product_ingredients (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    sale_product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity            REAL NOT NULL DEFAULT 1.0,           -- Cantidad del ingrediente necesaria
    unit                TEXT NOT NULL,                        -- Unidad de la cantidad (ej: 'g', 'ml')
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, sale_product_id, ingredient_id)
);

-- ============================================================
-- TABLA: orders (pedidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_number        INTEGER NOT NULL,                    -- Número de pedido secuencial por tenant
    table_number        TEXT,                                -- Número de mesa (puede ser string ej: "Mesa 3")
    customer_name       TEXT,                                -- Nombre del cliente (opcional)
    customer_document   TEXT,                                -- Documento del cliente (para factura)
    status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
                            'pending',      -- Registrado pero no enviado a cocina
                            'confirmed',    -- Enviado a cocina
                            'preparing',    -- En preparación (KDS)
                            'ready',        -- Listo para entregar
                            'served',       -- Entregado al cliente
                            'cancelled',    -- Cancelado
                            'completed'     -- Facturado y cerrado
                        )),
    payment_method      TEXT CHECK(payment_method IN ('cash', 'card', 'transfer', 'other')),
    subtotal            REAL NOT NULL DEFAULT 0.0,           -- Suma de precios de items sin impuestos
    discount            REAL NOT NULL DEFAULT 0.0,           -- Descuento total aplicado
    tax_total           REAL NOT NULL DEFAULT 0.0,           -- Suma de impuestos
    total               REAL NOT NULL DEFAULT 0.0,           -- Total a pagar (subtotal - descuento + impuestos)
    notes               TEXT,                                -- Notas generales del pedido
    created_by          TEXT NOT NULL REFERENCES users(id),  -- Usuario que creó el pedido
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at        TEXT,                                -- Fecha de cierre/facturación
    UNIQUE(tenant_id, order_number)                          -- Número de pedido único por tenant
);

-- Índice para búsqueda rápida de pedidos pendientes por tenant (KDS)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);

-- ============================================================
-- TABLA: order_items (líneas de pedido)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id          TEXT NOT NULL REFERENCES products(id), -- El producto vendido
    product_name        TEXT NOT NULL,                        -- Nombre del producto al momento de la venta (histórico)
    quantity            REAL NOT NULL DEFAULT 1.0,
    unit_price          REAL NOT NULL,                        -- Precio unitario al momento de la venta
    discount            REAL NOT NULL DEFAULT 0.0,            -- Descuento aplicado a este item
    tax_percentage      REAL NOT NULL DEFAULT 0.0,            -- % de impuesto aplicado
    tax_amount          REAL NOT NULL DEFAULT 0.0,            -- Monto de impuesto calculado
    subtotal            REAL NOT NULL,                        -- (unit_price * quantity) - discount
    total               REAL NOT NULL,                        -- subtotal + tax_amount
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
                            'pending',
                            'preparing',
                            'ready',
                            'served',
                            'cancelled'
                        )),
    sort_order          INTEGER DEFAULT 0,                    -- Orden de impresión o visualización
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para obtener items de un pedido
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(tenant_id, order_id);

-- ============================================================
-- TABLA: inventory_movements (Kardex)
-- Registra todas las entradas y salidas de inventario
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type       TEXT NOT NULL CHECK(movement_type IN (
                            'in',           -- Entrada (compra, ajuste positivo)
                            'out',          -- Salida (venta, consumo, desperdicio)
                            'transfer',     -- Transferencia entre almacenes (futuro)
                            'adjustment'    -- Ajuste por inventario físico
                        )),
    quantity            REAL NOT NULL,                        -- Cantidad (positiva para entrada, negativa para salida)
    unit_cost           REAL NOT NULL DEFAULT 0.0,            -- Costo unitario del movimiento
    total_cost          REAL NOT NULL,                        -- quantity * unit_cost
    reference_type      TEXT,                                -- Tipo de documento origen: 'purchase', 'order', 'adjustment', 'waste'
    reference_id        TEXT,                                -- ID del documento origen (ej: order_id, purchase_order_id)
    description         TEXT,                                -- Motivo o referencia adicional
    created_by          TEXT NOT NULL REFERENCES users(id),
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para consultar movimientos de un producto
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(tenant_id, product_id);
-- Índice para consultar movimientos por orden (para descontar inventario automáticamente)
CREATE INDEX IF NOT EXISTS idx_inventory_reference ON inventory_movements(tenant_id, reference_type, reference_id);

-- ============================================================
-- TABLA: invoices (facturas electrónicas)
-- Almacena la información de cada factura enviada a DIAN
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id            TEXT NOT NULL REFERENCES orders(id),  -- Pedido que origina la factura
    invoice_number      TEXT NOT NULL,                        -- Número de factura (prefijo + consecutivo DIAN)
    cufe                TEXT,                                -- Código Único de Factura Electrónica (hash)
    cude                TEXT,                                -- Código Único de Documento Electrónico (para nota crédito/débito)
    xml_signed          TEXT,                                -- XML firmado original enviado a DIAN
    xml_response        TEXT,                                -- XML de respuesta de DIAN (acuse)
    dian_status         TEXT NOT NULL DEFAULT 'pending' CHECK(dian_status IN (
                            'pending',      -- Generada localmente, no enviada
                            'sent',         -- Enviada a DIAN, esperando respuesta
                            'accepted',     -- Aceptada por DIAN
                            'rejected',     -- Rechazada por DIAN
                            'cancelled'     -- Anulada
                        )),
    dian_track_id       TEXT,                                -- ID de seguimiento devuelto por DIAN
    dian_status_message TEXT,                                -- Mensaje de estado (aceptación, rechazo)
    dian_response_date  TEXT,                                -- Fecha/hora de la respuesta de DIAN
    customer_document   TEXT,                                -- Documento del cliente (NIT o CC)
    customer_name       TEXT,                                -- Nombre del cliente
    customer_address    TEXT,                                -- Dirección del cliente
    subtotal            REAL NOT NULL,
    discount            REAL NOT NULL DEFAULT 0.0,
    tax_total           REAL NOT NULL,
    total               REAL NOT NULL,
    created_by          TEXT NOT NULL REFERENCES users(id),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, invoice_number)                        -- Número de factura único por tenant
);

-- Índice para búsqueda por track ID de DIAN
CREATE INDEX IF NOT EXISTS idx_invoices_track ON invoices(tenant_id, dian_track_id);

-- ============================================================
-- TABLA: audit_log (auditoría de eventos importantes)
-- Opcional, para trazabilidad de acciones críticas
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL REFERENCES users(id),
    action              TEXT NOT NULL,                        -- Ejemplo: 'order.created', 'invoice.sent', 'inventory.adjustment'
    entity_type         TEXT NOT NULL,                        -- Tabla afectada: 'orders', 'invoices', 'products', etc.
    entity_id           TEXT,                                -- ID del registro afectado
    old_values          TEXT,                                -- JSON con valores anteriores (opcional)
    new_values          TEXT,                                -- JSON con nuevos valores (opcional)
    ip_address          TEXT,                                -- Dirección IP del usuario
    user_agent          TEXT,                                -- User-Agent del navegador
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para consultar auditoría por entidad
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(tenant_id, entity_type, entity_id);
-- Índice para consultar auditoría por usuario
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(tenant_id, user_id);

-- ============================================================
-- TABLA: refresh_tokens (gestión de tokens de refresco JWT)
-- Permite revocación de sesiones.
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL UNIQUE,                -- Hash del refresh token
    expires_at          TEXT NOT NULL,                       -- Fecha de expiración
    is_revoked          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para búsqueda por hash de token
CREATE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token_hash);
-- Índice para limpiar tokens expirados por tenant
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(tenant_id, expires_at);

-- ============================================================
-- TRIGGERS: para mantener updated_at actualizado automáticamente
-- SOLO SQLite: SQLite soporta triggers, pero no funciones como now()
-- Se recomienda manejarlo desde la aplicación con SQLAlchemy event listeners.
-- Sin embargo, por compatibilidad, se incluyen triggers simples.
-- NOTA: Para MySQL/PostgreSQL se usarían funciones nativas, pero aquí es SQLite.
-- ============================================================

-- Trigger para actualizar updated_at en restaurants
CREATE TRIGGER IF NOT EXISTS trg_restaurants_updated_at
    AFTER UPDATE ON restaurants
    FOR EACH ROW
BEGIN
    UPDATE restaurants SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Trigger para actualizar updated_at en users
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Trigger para actualizar updated_at en orders
CREATE TRIGGER IF NOT EXISTS trg_orders_updated_at
    AFTER UPDATE ON orders
    FOR EACH ROW
BEGIN
    UPDATE orders SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Trigger para actualizar updated_at en invoices
CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
    AFTER UPDATE ON invoices
    FOR EACH ROW
BEGIN
    UPDATE invoices SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Trigger para generar order_number secuencial por tenant al insertar una orden
CREATE TRIGGER IF NOT EXISTS trg_orders_auto_number
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN NEW.order_number IS NULL
BEGIN
    UPDATE orders SET order_number = (
        SELECT COALESCE(MAX(order_number), 0) + 1 FROM orders WHERE tenant_id = NEW.tenant_id
    ) WHERE id = NEW.id;
END;

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================
