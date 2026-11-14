import json,hashlib,os
from pathlib import Path
from app.config import Settings
from app.db import Database,TABLES
settings=Settings.from_env();assert settings.database_url,'Expected PostgreSQL backend';db=Database(settings.database_path,settings.database_url,settings.database_schema);expected=json.loads(Path('/verify/expected-rows.json').read_text());summary={}
with db.connect() as connection:
 for table in TABLES:
  rows=connection.execute('SELECT * FROM "'+table+'"').fetchall();digest=hashlib.sha256('\n'.join(sorted(repr(tuple(row.values())) for row in rows)).encode()).hexdigest();summary[table]={'rows':len(rows),'sha256':digest};assert summary[table]==expected['tables'][table],'Row contents mismatch in '+table
 seq=connection.execute('SELECT last_value,is_called FROM sync_changes_sequence_seq').fetchone();value=seq['last_value'] if seq['is_called'] else 0;assert value==expected['sequence'],'Sequence mismatch'
 # RLS is active and runtime has no schema-create or table ownership rights.
 assert not connection.execute("SELECT has_schema_privilege(current_user, current_schema(), 'CREATE')").fetchone()[0]
 assert not connection.execute("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()[0]
 assert all(r[0] for r in connection.execute("SELECT relrowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relkind='r'"))
print(json.dumps({'verified':True,'rows':{t:v['rows'] for t,v in summary.items()},'sequence':value,'database_backend':db.backend,'runtime_least_privilege':True}))
