from pathlib import Path
import json,uuid,secrets,urllib.request,urllib.error,http.cookiejar,subprocess,time
root=Path('/srv/dowze/academie');work=root/'supabase-migration-20261006';origin='https://academie.dowze.ch';email='migration-check-'+uuid.uuid4().hex+'@example.com';password=secrets.token_urlsafe(32);account=None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,method='GET',body=None,headers=None):
 h={'Origin':origin};h.update(headers or {})
 if body is not None:h['Content-Type']='application/json'
 req=urllib.request.Request(origin+path,method=method,headers=h,data=None if body is None else json.dumps(body).encode())
 try:
  with client.open(req,timeout=15) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
try:
 status,user=request('/v1/accounts','POST',{'email':email,'password':password});assert status==201;account=user['id']
 status,session=request('/v1/sessions','POST',{'email':email,'password':password});assert status==201;csrf=session['csrf_token'];h={'X-CSRF-Token':csrf}
 status,user=request('/v1/me');assert status==200 and user['id']==account
 status,_=request('/v1/spaces/migration-check','PUT',{'formation_id':'migration-check','academic_year':'2026-2027','title':'Test migration temporaire'},h);assert status==201
 path='/v1/spaces/migration-check/documents/notesMarkdown/check';body={'base_version':0,'content':{'text':'Vérification PostgreSQL — UTF-8 ✓'}};key='migration-'+uuid.uuid4().hex;hh={**h,'X-Idempotency-Key':key}
 status,result=request(path,'PUT',body,hh);assert status==200
 status,replay=request(path,'PUT',body,hh);assert status==200 and replay==result
 status,_=request(path,'PUT',body,{**h,'X-Idempotency-Key':key+'-conflict'});assert status==409
 status,changes=request('/v1/spaces/migration-check/changes');assert status==200 and changes['items'][0]['content']==body['content']
 sql="SELECT count(*) FROM dowze_academie.sync_documents WHERE account_id='"+account+"' AND document_id='check';"
 r=subprocess.run(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-Atc',sql],capture_output=True,timeout=60);assert r.returncode==0 and r.stdout.strip()==b'1'
 result={'verified':True,'public_https':True,'login_and_session':True,'utf8_write_in_supabase':True,'idempotence':True,'version_conflict':409,'readback':True,'time':time.time()}
finally:
 if account:
  # Remove only the unique account created by this check; all dependent rows cascade.
  sql="DELETE FROM dowze_academie.accounts WHERE id='"+account+"' AND email='"+email+"';"
  r=subprocess.run(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atc',sql],capture_output=True,timeout=60);assert r.returncode==0 and r.stdout.strip()==b'DELETE 1','Synthetic account cleanup failed'
 password=''
result['synthetic_account_removed']=True;(work/'live-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
