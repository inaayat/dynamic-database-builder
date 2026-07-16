"""Quote SQLite identifiers for reserved table/column names."""

SQLITE_RESERVED = {"references", "group", "order", "table"}


def q(ident: str) -> str:
    if ident.lower() in SQLITE_RESERVED or not ident.isidentifier():
        return f'"{ident}"'
    return ident
