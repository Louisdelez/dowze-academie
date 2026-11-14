"""Run behavioral tests in preprovisioned schemas with a non-DDL role."""
import itertools,os,secrets
from app.db import TABLES, Database
from pathlib import Path
import pytest
from app.config import Settings

@pytest.fixture(autouse=True)
def postgres_settings(monkeypatch):
    secret_file=os.getenv("DOWZE_TEST_DATABASE_URL_FILE")
    if not secret_file:yield;return
    # SQLite-only candidate runs do not import a PostgreSQL driver or read a DSN.
    import psycopg
    from psycopg import sql
    dsn=Path(secret_file).read_text().strip();schemas={};original=Settings.__post_init__;original_db=Database.__init__;schema_numbers=itertools.count()
    def initialize(settings):
        original(settings)
        if settings.database_path.is_file() and "restored" in str(settings.database_path):
            object.__setattr__(settings,"database_url",None);return
        if settings.database_url:return
        key=str(settings.database_path)
        if key not in schemas:
            number=next(schema_numbers);assert number<16,"qualification schema pool exhausted"
            schemas[key]="academie_qualification_"+str(number)
        object.__setattr__(settings,"database_url",dsn);object.__setattr__(settings,"database_schema",schemas[key])
    def database_initialize(instance,path,database_url=None,schema="dowze_academie"):
        if database_url is None and str(path) in schemas:
            database_url=dsn;schema=schemas[str(path)]
        original_db(instance,path,database_url,schema)
    monkeypatch.setattr(Database,"__init__",database_initialize)
    monkeypatch.setattr(Settings,"__post_init__",initialize)
    yield
    with psycopg.connect(dsn) as connection:
        for schema in schemas.values():
            tables=sql.SQL(",").join(sql.Identifier(schema,table) for table in TABLES)
            connection.execute(sql.SQL("TRUNCATE {} CASCADE").format(tables))
            connection.execute(sql.SQL("INSERT INTO {}(key,value) VALUES ('cursor_secret',%s)").format(sql.Identifier(schema,"app_metadata")),(secrets.token_hex(32),))
