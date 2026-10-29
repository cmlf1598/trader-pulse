import sys

import uvicorn
from pydantic import ValidationError

from app.core.config import get_settings


def main() -> None:
    try:
        settings = get_settings()
    except ValidationError as exc:
        print(f"Invalid configuration, refusing to start:\n{exc}", file=sys.stderr)
        sys.exit(1)

    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=settings.port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        server_header=False,
    )


if __name__ == "__main__":
    main()
