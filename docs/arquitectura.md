# Arquitectura de GastroFlow

## 1. Principios Arquitectónicos

- **Clean Architecture (Arquitectura Limpia)**: Separación de responsabilidades en capas concéntricas. Las dependencias apuntan hacia adentro (reglas de negocio no dependen de frameworks ni infraestructura).
- **Hexagonal (Ports & Adapters)**: Puertos (interfaces) definidos en la capa de dominio y adaptadores (implementaciones) en infraestructura.
- **Multitenant B2B**: Cada restaurante es un tenant. Datos aislados mediante **tenant_id** en todas las entidades (Discriminador) + esquema separado opcional en producción (PostgreSQL schemas). En desarrollo con SQLite usamos columna discriminatoria.
- **Sincronización en tiempo real**: WebSockets para KDS, notificaciones Push para POS y pantalla de cocina.
- **Despliegue cloud-native**: Contenedores Docker, escalado horizontal de servicios stateless (FastAPI), WebSockets manejados con Redis Pub/Sub si se escala a múltiples instancias.

## 2. Stack Tecnológico

| Capa           | Tecnología                     | Propósito                                |
|----------------|--------------------------------|------------------------------------------|
| Backend        | Python 3.12+ / FastAPI         | API REST + WebSockets + lógica de negocio|
| ORM            | SQLAlchemy 2.0 + Alembic       | Acceso a datos, migraciones              |
| Base de datos  | SQLite (desarrollo) / PostgreSQL (producción) | Persistencia relacional          |
| Autenticación  | JWT (access + refresh tokens)  | Sesiones sin estado, multitenant         |
| Mensajería     | Redis (opcional, para escalar WebSockets) | Pub/Sub entre instancias                 |
| Frontend       | React 18 + Vite + Tailwind CSS  | Aplicación Web (POS, KDS, panel admin)   |
| Tiempo real    | WebSockets (FastAPI nativo)     | Actualización instantánea de pedidos     |
| Facturación    | Librería externa (e.j: factura-electronica-dian) + XML template | Envío a DIAN        |

## 3. Estructura de Carpetas (Clean Architecture)
