import pytest
from pydantic import ValidationError

from app.core.config import DEV_ORIGINS, Settings
from tests.conftest import FRONTEND_URL, SettingsFactory


def test_gemini_api_key_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("FRONTEND_URL", FRONTEND_URL)

    with pytest.raises(ValidationError, match="gemini_api_key"):
        Settings(_env_file=None)  # pyright: ignore[reportCallIssue]


@pytest.mark.parametrize("key", ["", "   "])
def test_blank_gemini_api_key_is_rejected(make_settings: SettingsFactory, key: str) -> None:
    with pytest.raises(ValidationError, match="GEMINI_API_KEY must not be empty"):
        make_settings(gemini_api_key=key)


def test_frontend_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.delenv("FRONTEND_URL", raising=False)

    with pytest.raises(ValidationError, match="frontend_url"):
        Settings(_env_file=None)  # pyright: ignore[reportCallIssue]


def test_settings_are_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "secret-key")
    monkeypatch.setenv("FRONTEND_URL", FRONTEND_URL)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")
    monkeypatch.setenv("PORT", "9000")

    settings = Settings(_env_file=None)  # pyright: ignore[reportCallIssue]

    assert settings.gemini_api_key.get_secret_value() == "secret-key"
    assert settings.gemini_model == "gemini-3.8-flash"
    assert settings.port == 9000


def test_api_key_is_not_leaked_in_repr(make_settings: SettingsFactory) -> None:
    settings = make_settings(gemini_api_key="super-secret")

    assert "super-secret" not in repr(settings)
    assert "super-secret" not in str(settings.model_dump())


def test_defaults(make_settings: SettingsFactory) -> None:
    settings = make_settings()

    assert settings.gemini_model == "gemini-3-flash-preview"
    assert settings.port == 8080
    assert settings.sentiment_cache_ttl_seconds == 600


def test_production_requires_https(make_settings: SettingsFactory) -> None:
    with pytest.raises(ValidationError, match="https"):
        make_settings(environment="production", frontend_url="http://traderpulse.vercel.app")


@pytest.mark.parametrize("port", ["0", "70000", "abc"])
def test_invalid_port_is_rejected(make_settings: SettingsFactory, port: str) -> None:
    with pytest.raises(ValidationError, match="port"):
        make_settings(port=port)


def test_production_cors_allows_only_frontend(make_settings: SettingsFactory) -> None:
    settings = make_settings(frontend_url=f"{FRONTEND_URL}/some/path/")

    assert settings.cors_origins == [FRONTEND_URL]


def test_development_cors_adds_localhost(make_settings: SettingsFactory) -> None:
    settings = make_settings(environment="development", frontend_url="http://localhost:3000")

    assert settings.cors_origins == list(DEV_ORIGINS)
