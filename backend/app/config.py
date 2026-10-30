import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
load_dotenv(dotenv_path=".env.local")


@lru_cache
def get_settings():
    return {
        "DATABASE_URL": os.getenv("DATABASE_URL", ""),
        "PORT": os.getenv("PORT", "8000"),
        "SUPABASE_URL": os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""),
        "SUPABASE_ANON_KEY": (
            os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
        ),
        "FRONTEND_URL": (
            os.getenv("FRONTEND_URL")
            or os.getenv("NEXT_PUBLIC_SITE_URL")
            or os.getenv("VERCEL_URL", "http://localhost:3000")
        ),
    }


settings = get_settings()
