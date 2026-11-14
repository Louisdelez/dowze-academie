from pathlib import Path
import sys,json,subprocess,time,fcntl,os
os.umask(0o077);sys.path.insert(0,'/home/louisdelez/supabase-academie-20261006');import migrate
root=migrate.root;work=migrate.work;run=migrate.run
pre=json.loads((work/'preflight-verification.json').read_text());assert pre['verified'] and pre['private_http'] and pre['runtime_least_privilege']
assert '44 passed' in (work/'postgres-tests.log').read_text()
original=json.loads(run(['docker','inspect','dowze-academie-api']))[0];old='dowze-academie-api-sqlite-20261006';name='dowze-academie-api';stamp=str(time.time_ns());final='sqlite-before-supabase-'+stamp;lock=open(root/'config/backup.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
assert not run(['docker','ps','-a','--filter','name=^/'+old+'$','--format','{{.ID}}']).strip()
(work/'sqlite-container-before.json').write_text(json.dumps(original));new=False;renamed=False;stopped=False;public_stopped=False
try:
 run(['systemctl','stop','dowze-academie-backup.timer','restbackup-dowze-01.timer'])
 run(['docker','rm','-f','dowze-academie-pg-preflight'])
 run(['docker','stop','dowze-academie-public']);public_stopped=True
 run(['docker','update','--restart=no',name]);run(['docker','stop',name]);stopped=True
 args=['docker','run','--rm','--network','none','--user','10001:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777','-v',str(root/'data')+':/srv/dowze/data:Z','-v',str(root/'backups')+':/srv/dowze/backups:Z']
 for value in original['Config']['Env']:args+=['-e',value]
 args+=[original['Image'],'python','-m','app.manage','backup-bundle','/srv/dowze/backups/'+final]
 run(args,timeout=600)
 migrate.import_database(root/'backups'/final/'api.sqlite3')
 run(['docker','rename',name,old]);renamed=True
 new=True;migrate.create_candidate(name,root/'data',30582,reference=old)
 for _ in range(30):
  try:
   script="import urllib.request;assert urllib.request.urlopen('http://127.0.0.1:30582/health',timeout=2).status==200"
   run(['docker','exec',name,'python','-c',script],timeout=5);break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('PostgreSQL API health failed')
 verify=(Path('/home/louisdelez/supabase-academie-20261006/verify-import.py')).read_text().replace("Path('/verify/expected-rows.json').read_text()",repr((work/'expected-rows.json').read_text()))
 verified=json.loads(run(['docker','exec','-i',name,'python','-'],verify.encode()));assert verified['verified']
 (work/'cutover-data-verification.json').write_text(json.dumps(verified,indent=2))
 run(['docker','start','dowze-academie-public']);public_stopped=False
 receipt={'verified':True,'live_database':'Supabase PostgreSQL','database':'postgres','schema':'dowze_academie','role':'dowze_academie_api','api_container':name,'api_image':json.loads(run(['docker','inspect',name]))[0]['Image'],'previous_container':old,'previous_container_stopped':True,'previous_sqlite_backup':final,'row_verification':verified,'cutover_at':time.time(),'source_sqlite_retained':True}
 (work/'cutover-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
except BaseException:
 # External writes were blocked until full import validation. Safe rollback before public restart.
 if public_stopped:
  if new:subprocess.run(['docker','rm','-f',name],capture_output=True)
  if renamed:run(['docker','rename',old,name])
  if stopped:
   label=original['MountLabel']
   for folder in [root/'data',root/'backups']:run(['chcon','-R',label,str(folder)])
   run(['docker','update','--restart=unless-stopped',name]);run(['docker','start',name])
  run(['docker','start','dowze-academie-public'])
 raise
finally:
 run(['systemctl','start','dowze-academie-backup.timer','restbackup-dowze-01.timer']);fcntl.flock(lock,fcntl.LOCK_UN)
