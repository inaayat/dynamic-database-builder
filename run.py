#!/usr/bin/env python3
"""Run the local editor server."""

from __future__ import annotations

import uvicorn

from kit.schema.loader import get_loader


def main() -> None:
    loader = get_loader()
    package = loader.package
    port = package.site.port
    print(f"Starting {package.site.title} on http://127.0.0.1:{port}")
    print(f"  Schema package: {loader.package_name}")
    print(f"  Editor:         http://127.0.0.1:{port}/")
    print(f"  API schema:     http://127.0.0.1:{port}/api/schema")
    uvicorn.run(
        "kit.api.app:app",
        host="127.0.0.1",
        port=port,
        reload=True,
        reload_dirs=["kit", "static"],
    )


if __name__ == "__main__":
    main()
