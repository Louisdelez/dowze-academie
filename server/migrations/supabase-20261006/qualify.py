from pathlib import Path
import os,subprocess,secrets,json,time,re
os.umask(0o077);root=Path('/srv/dowze/academie');work=root/'supabase-migration-20261006';work.mkdir(mode=0o700,exist_ok=True)
source=Path('/home/louisdelez/supabase-academie-20261006')
def run(args,stdin=None,timeout=120,check=True):
 r=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
 if check and r.returncode:raise RuntimeError('Command failed: '+args[0]+'; '+r.stderr.decode()[:1000])
 return r

def sql(command):return run(['docker','exec','-i','supabase-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],command.encode())
# Refuse to reuse any preexisting role or schema. Cleanup is limited to this run's objects.
role='academie_qualification';schemas=['academie_qualification_'+str(i) for i in range(16)]
check=sql("select rolname from pg_roles where rolname='"+role+"'; select nspname from pg_namespace where nspname like 'academie_qualification_%';").stdout.decode();assert not re.search(r'academie_qualification',check),'Qualification objects already exist'
secret=work/'test-database-url';created=False
try:
 password=secrets.token_urlsafe(48)
 sql("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 16 PASSWORD '"+password+"' VALID UNTIL '2026-10-07 00:00:00+00';")
 created=True
 secret.write_text('postgresql://'+role+':'+password+'@supabase-db:5432/postgres');os.chown(secret,10001,10001);secret.chmod(0o400)
 import sys
 sys.path.insert(0,str(source));from app.db import POSTGRES_SCHEMA
 commands=[]
 for schema in schemas:
  commands.append('CREATE SCHEMA '+schema+'; SET search_path TO '+schema+',pg_catalog; '+POSTGRES_SCHEMA+"INSERT INTO app_metadata(key,value) VALUES ('cursor_secret','"+secrets.token_hex(32)+"'); GRANT USAGE ON SCHEMA "+schema+' TO '+role+'; GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA '+schema+' TO '+role+'; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA '+schema+' TO '+role+';')
 sql('\n'.join(commands))
 args=['docker','run','--rm','--name','dowze-academie-qualification','--network','supabase_default','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=512m,mode=1777','-v',str(secret)+':/run/test-database-url:ro,Z','-e','DOWZE_ENV=test','-e','DOWZE_ALLOWED_ORIGINS=https://app.example.invalid','-e','DOWZE_DATABASE_PATH=/tmp/bootstrap.sqlite3','-e','DOWZE_PACKAGE_DIR=/tmp/bootstrap-packages','-e','DOWZE_BLOB_DIR=/tmp/bootstrap-blobs','-e','DOWZE_TEST_DATABASE_URL_FILE=/run/test-database-url','dowze-academie-api:test-supabase-20261006','python','-m','pytest','-q','-p','no:cacheprovider','tests']
 result=run(args,timeout=600,check=False);(work/'postgres-tests.log').write_bytes(result.stdout+result.stderr);print((result.stdout+result.stderr).decode()[-15000:]);print(json.dumps({'tests_exit_code':result.returncode}))
finally:
 run(['docker','rm','-f','dowze-academie-qualification'],check=False)
 if created:
  sql(';'.join('DROP SCHEMA IF EXISTS '+schema+' CASCADE' for schema in schemas)+'; DROP ROLE '+role+';')
 secret.unlink(missing_ok=True)
