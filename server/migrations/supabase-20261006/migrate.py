from pathlib import Path
import os,subprocess,secrets,json,time,sqlite3,hashlib,sys,shutil
os.umask(0o077);root=Path('/srv/dowze/academie');work=root/'supabase-migration-20261006';work.mkdir(mode=0o700,exist_ok=True);schema='dowze_academie';role='dowze_academie_api'
sys.path.insert(0,'/home/louisdelez/supabase-academie-20261006');from app.db import TABLES,POSTGRES_SCHEMA

def run(args,stdin=None,timeout=120):
 r=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
 if r.returncode:
  # SQL or container diagnostics could contain account data or credentials.
  (work/'last-error.private').write_bytes(r.stderr+r.stdout)
  raise RuntimeError('Command failed: '+args[0]+'. Private diagnostics retained on server.')
 return r.stdout

def sql(command):return run(['docker','exec','-i','supabase-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],command.encode())

def cell(value):
 if value is None:return r'\N'
 return str(value).replace('\\','\\\\').replace('\t',r'\t').replace('\n',r'\n').replace('\r',r'\r')

def import_database(source):
 c=sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True)
 assert c.execute('pragma integrity_check').fetchone()[0]=='ok' and not c.execute('pragma foreign_key_check').fetchall()
 tables=[r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")];assert set(tables)==set(TABLES),'Unexpected source schema'
 commands=['BEGIN; SET LOCAL search_path TO '+schema+',pg_catalog;', 'TRUNCATE '+','.join(TABLES)+' RESTART IDENTITY CASCADE;'];summary={}
 for table in TABLES:
  columns=[r[1] for r in c.execute('PRAGMA table_info("'+table+'")')];rows=c.execute('SELECT * FROM "'+table+'"').fetchall()
  commands.append('COPY "'+table+'" ('+','.join('"'+n+'"' for n in columns)+') FROM STDIN;')
  commands.extend('\t'.join(cell(value) for value in row) for row in rows);commands.append(r'\.')
  summary[table]={'rows':len(rows),'sha256':hashlib.sha256('\n'.join(sorted(repr(tuple(row)) for row in rows)).encode()).hexdigest()}
 row=c.execute("select seq from sqlite_sequence where name='sync_changes'").fetchone();sequence=row[0] if row else 0
 commands.append("SELECT setval('sync_changes_sequence_seq',"+str(max(sequence,1))+','+('true' if sequence else 'false')+"); COMMIT;")
 sql('\n'.join(commands));c.close();(work/'expected-rows.json').write_text(json.dumps({'tables':summary,'sequence':sequence},indent=2));print(json.dumps({'imported':{t:v['rows'] for t,v in summary.items()},'sequence':sequence}))

def create_candidate(name,data,port=None,reference="dowze-academie-api"):
 config=json.loads(run(['docker','inspect',reference]))[0];c=config['Config'];h=config['HostConfig'];args=['docker','create','--name',name,'--network','supabase_default','--restart','no' if port is None else 'unless-stopped','--user','10001:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',str(h['Memory']),'--memory-swap',str(h['MemorySwap']),'--cpus',str(h['NanoCpus']/1e9),'--pids-limit',str(h['PidsLimit'])]
 for k,v in h['Tmpfs'].items():args+=['--tmpfs',k+':'+v]
 args+=['-v',str(data)+':/srv/dowze/data:Z','-v',str(root/'backups')+':/srv/dowze/backups:Z','-v',str(root/'config/secrets/postgres-url')+':/run/dowze-postgres-url:ro,Z']
 for env in c['Env']:
  if not env.startswith(('DOWZE_DATABASE_URL=','DOWZE_DATABASE_URL_FILE=','DOWZE_DATABASE_SCHEMA=')):args+=['-e',env]
 args+=['-e','DOWZE_DATABASE_URL_FILE=/run/dowze-postgres-url','-e','DOWZE_DATABASE_SCHEMA='+schema]
 if port:args+=['-p','127.0.0.1:'+str(port)+':30582']
 for k,v in c.get('Labels',{}).items():args+=['--label',k+'='+v]
 args+=['--label','org.dowze.database=supabase-postgresql','--health-cmd',"python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:30582/health',timeout=2).read()\"",'--health-interval','30s','--health-timeout','3s','--health-start-period','10s','--health-retries','3','dowze-academie-api:supabase-20261006','uvicorn','app.main:app','--host','0.0.0.0','--port','30582','--no-server-header','--proxy-headers','--forwarded-allow-ips','127.0.0.1,'+docker_gateway()]
 run(args);run(['docker','start',name])

def docker_gateway():return json.loads(run(['docker','network','inspect','supabase_default']))[0]['IPAM']['Config'][0]['Gateway']

if __name__=='__main__':
 assert sys.argv[1]=='prepare'
 assert sql("select count(*) from pg_namespace where nspname='dowze_academie';").strip()==b'0','Existing target schema; refuse overwrite'
 assert sql("select count(*) from pg_roles where rolname='dowze_academie_api';").strip()==b'0','Existing runtime role; refuse overwrite'
 run(['python3',str(root/'config/backup.py')],timeout=600)
 snapshot=json.loads((root/'config/last-backup.json').read_text());bundle=root/'backups'/snapshot['backup'];copy=work/'preflight-data';assert not copy.exists();shutil.copytree(bundle,copy);run(['chown','-R','10001:10001',str(copy)])
 password=secrets.token_urlsafe(48);folder=root/'config/secrets';folder.mkdir(mode=0o700,exist_ok=True);secret=folder/'postgres-url';assert not secret.exists();secret.write_text('postgresql://'+role+':'+password+'@supabase-db:5432/postgres');os.chown(secret,10001,10001);secret.chmod(0o400)
 command="BEGIN; CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 32 PASSWORD '"+password+"'; CREATE SCHEMA "+schema+" AUTHORIZATION postgres; SET LOCAL search_path TO "+schema+",pg_catalog; "+POSTGRES_SCHEMA+' REVOKE ALL ON SCHEMA '+schema+' FROM PUBLIC,anon,authenticated,service_role; REVOKE ALL ON ALL TABLES IN SCHEMA '+schema+' FROM PUBLIC,anon,authenticated,service_role; GRANT USAGE ON SCHEMA '+schema+' TO '+role+'; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA '+schema+' TO '+role+'; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA '+schema+' TO '+role+';'
 for table in TABLES:command+=' ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY; CREATE POLICY server_access ON '+table+' TO '+role+' USING (true) WITH CHECK (true);'
 command+=' COMMIT;';sql(command);password='';import_database(copy/'api.sqlite3');create_candidate('dowze-academie-pg-preflight',copy)
 (work/'prepared.json').write_text(json.dumps({'schema':schema,'database':'postgres','supabase_container':'supabase-db','role':role,'prepared_at':time.time(),'source_snapshot':snapshot['backup'],'cutover':False},indent=2));print('Supabase data imported; private preflight candidate started')
