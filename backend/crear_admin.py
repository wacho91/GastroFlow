import asyncio
import bcrypt
from sqlalchemy import select
from src.database import async_session_factory
from src.models import User, Restaurant

async def crear():
    async with async_session_factory() as db:
        # 1. Verificar si ya existe un restaurante, si no, crearlo
        res = await db.execute(select(Restaurant))
        rest = res.scalars().first()
       
        if not rest:
            rest = Restaurant(
                name="Sabor & Brasa",
                legal_name="Sabor y Brasa S.A.S",
                tax_id="900123456-7",
                address="Calle 123, Bogota"
            )
            db.add(rest)
            await db.commit()
            await db.refresh(rest)
            print(f"Restaurante creado con ID: {rest.id}")
        else:
            print(f"Usando restaurante existente con ID: {rest.id}")

        # 2. Crear usuario Admin si no existe
        usr = await db.execute(select(User).where(User.email == "admin@saborybrasa.com"))
        user = usr.scalars().first()
       
        if not user:
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw("12345678".encode('utf-8'), salt).decode('utf-8')
            user = User(
                email="admin@saborybrasa.com",
                full_name="Cristian Admin",
                password_hash=hashed,
                role="admin",
                tenant_id=rest.id,
                is_active=1
            )
            db.add(user)
            await db.commit()
            print("¡Usuario Admin creado con éxito! Ya puedes iniciar sesión en la web.")
        else:
            print("El usuario Admin ya existe en la base de datos.")

if __name__ == "__main__":
    asyncio.run(crear())