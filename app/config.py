"""
Centralized Configuration
Uses pydantic-settings for validated environment variables.
"""
import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from functools import lru_cache

# Load .env into os.environ so LangChain/LangSmith SDK can read tracing config
load_dotenv()

class Settings(BaseSettings):
    
    # LLM Configuration
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_URL") or "http://localhost:11434"
    primary_model: str = "mistral"
    fallback_model: str = "llama3"
    
    # LangSmith — reads LANGSMITH_API_KEY and LANGSMITH_PROJECT from .env
    langchain_tracing_v2: bool = True
    langsmith_api_key: str = ""
    langsmith_project: str = "prod-api"

    # Database — reads DATABASE_URL from .env (Neon PostgreSQL in cloud, SQLite locally)
    database_url: str = "sqlite+aiosqlite:///rag_app.db"

    # Application
    app_env: str = "development"
    log_level: str = "INFO"
    rate_limit: str = "20/minute"
    cache_ttl_seconds: int = 300
    max_retries: int = 3
    
    model_config = {"env_file": ".env", "extra": "ignore"}
    
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"
    
@lru_cache
def get_settings() -> Settings:
    """Cached settings instance - loaded once, reused everywhere."""
    return Settings()