from pathlib import Path
import subprocess,json,os,time,tempfile,sqlite3,hashlib,uuid
os.umask(0o077);root=Path('/srv/dowze/academie');work=root/'supabase-migration-20261006';state=Path('/var/lib/restbackup/dowze-01');c=json.loads(Path('/etc/restbackup/dowze-01.json').read_text());sid=json.loads((state/'last-success.json').read_text())['snapshot'];env=dict(os.environ,RESTIC_PASSWORD=c['repo_password'],RESTIC_REST_USERNAME=c['rest_user'],RESTIC_REST_PASSWORD=c['rest_password']);restic=['/usr/local/bin/restic-managed','--no-cache','-r',c['repository'],'--cacert',str(state/'ca.crt')]
def run(args,stdin=None,timeout=120,environment=None):
 r=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout,env=environment)
 if r.returncode:(work/'restore-error.private').write_bytes(r.stdout+r.stderr);raise RuntimeError('Restore command failed: '+args[0]+'. Private diagnostic retained.')
 return r.stdout
name='academie-pg-restore-'+uuid.uuid4().hex[:12];created=False
try:
 with tempfile.TemporaryDirectory(prefix='academie-postgres-restore-',dir='/srv/dowze/exports') as folder:
  folder=Path(folder);mapping=json.loads(run(restic+['dump',sid,str(state/'export/postgres-map.json')],environment=env));entry=next(row for row in mapping if row['container']=='supabase-db' and row['database']=='postgres');dump=run(restic+['dump',sid,str(state/'export'/entry['file'])],environment=env);assert len(dump)==entry['bytes'];(folder/'postgres.dump').write_bytes(dump)
  run(['docker','run','-d','--name',name,'--network','none','--memory','512m','--cpus','0.5','--pids-limit','128','--user','postgres','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/var/lib/postgresql/data:rw,size=256m,uid=70,gid=70','--tmpfs','/var/run/postgresql:rw,size=16m,mode=1777','--tmpfs','/tmp:rw,size=32m,mode=1777','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);created=True
  for _ in range(60):
   if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0:break
   time.sleep(.5)
  else:raise RuntimeError('Isolated restore database did not become ready')
  run(['docker','exec',name,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE ROLE dowze_academie_api NOLOGIN; CREATE SCHEMA dowze_academie;'])
  run(['docker','exec','-i',name,'pg_restore','-U','postgres','--schema=dowze_academie','--no-owner','--no-acl','--exit-on-error','-d','postgres'],stdin=dump)
  backup=json.loads(run(restic+['dump',sid,str(root/'config/last-backup.json')],environment=env));bundle=root/'backups'/backup['backup'];sqlite_map=json.loads(run(restic+['dump',sid,str(state/'export/sqlite-map.json')],environment=env));item=next(row for row in sqlite_map if row['source']==str(bundle/'api.sqlite3'));sqlite_file=folder/'recovery.sqlite3';sqlite_file.write_bytes(run(restic+['dump',sid,str(state/'export'/item['file'])],environment=env));local=sqlite3.connect(sqlite_file);assert local.execute('pragma integrity_check').fetchone()[0]=='ok' and not local.execute('pragma foreign_key_check').fetchall()
  import sys
  sys.path.insert(0,'/home/louisdelez/supabase-academie-20261006');from app.db import TABLES
  counts={};same=True
  for table in TABLES:
   query='SELECT COALESCE(json_agg(row_to_json(t)),\'[]\'::json) FROM (SELECT * FROM dowze_academie."'+table+'") t;';rows=json.loads(run(['docker','exec',name,'psql','-U','postgres','-d','postgres','-Atc',query]));columns=[row[1] for row in local.execute('PRAGMA table_info("'+table+'")')];postgres_hash=hashlib.sha256('\n'.join(sorted(repr(tuple(row[column] for column in columns)) for row in rows)).encode()).hexdigest();sqlite_rows=local.execute('SELECT * FROM "'+table+'"').fetchall();sqlite_hash=hashlib.sha256('\n'.join(sorted(repr(tuple(row)) for row in sqlite_rows)).encode()).hexdigest();same=same and postgres_hash==sqlite_hash;counts[table]=len(rows)
  assert same,'Native PostgreSQL restore differs from coherent recovery snapshot; inspect for writes between snapshot times'
  assert run(['docker','exec',name,'psql','-U','postgres','-d','postgres','-Atc',"SELECT count(*) FROM pg_constraint WHERE connamespace='dowze_academie'::regnamespace AND NOT convalidated;"]).strip()==b'0'
  assert run(['docker','exec',name,'psql','-U','postgres','-d','postgres','-Atc',"SELECT count(*) FROM pg_class WHERE relnamespace='dowze_academie'::regnamespace AND relkind='r' AND NOT relrowsecurity;"]).strip()==b'0'
  result={'verified':True,'snapshot':sid,'native_postgresql_restore':True,'tables':counts,'contents_match_coherent_snapshot':True,'constraints_validated':True,'rls_preserved':True,'network_isolated':True,'time':time.time()};(work/'postgres-restore-verification.json').write_text(json.dumps(result,indent=2));(root/'config/supabase-postgres-restore-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 if created:subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=60)
