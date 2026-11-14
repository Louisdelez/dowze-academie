from pathlib import Path
import subprocess,json,time,urllib.request
root=Path('/srv/dowze/academie');work=root/'supabase-migration-20261006';source=Path('/home/louisdelez/supabase-academie-20261006');name='dowze-academie-pg-preflight'
script=(source/'verify-import.py').read_text().replace("Path('/verify/expected-rows.json').read_text()",repr((work/'expected-rows.json').read_text()))
r=subprocess.run(['docker','exec','-i',name,'python','-'],input=script.encode(),capture_output=True,timeout=60)
if r.returncode:(work/'preflight-error.private').write_bytes(r.stdout+r.stderr);raise RuntimeError('Private import verification failed')
verified=json.loads(r.stdout);print(json.dumps(verified));(work/'preflight-verification.json').write_text(json.dumps(verified,indent=2))
http="""import urllib.request,json,urllib.error
for path in ['/health','/v1/catalog','/v1/me']:
 try:
  with urllib.request.urlopen('http://127.0.0.1:30582'+path,timeout=5) as response:
   data=json.load(response);assert response.status==200
   if path=='/v1/catalog':assert len(data['items'])==55
 except urllib.error.HTTPError as e:assert path=='/v1/me' and e.code==401
print('Private HTTP checks passed')
"""
r=subprocess.run(['docker','exec','-i',name,'python','-'],input=http.encode(),capture_output=True,timeout=60);assert r.returncode==0,r.stderr.decode();print(r.stdout.decode())
# Ensure no broad access appeared for Supabase browser roles.
sql="SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='dowze_academie' AND grantee IN ('anon','authenticated','service_role','PUBLIC');"
r=subprocess.run(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-Atc',sql],capture_output=True,timeout=60);assert r.returncode==0 and r.stdout.strip()==b'0'
verified.update(private_http=True,public_role_grants=0,verified_at=time.time());(work/'preflight-verification.json').write_text(json.dumps(verified,indent=2))
