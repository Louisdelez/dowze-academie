"""Prepare a new immutable server release. No network publication, no key in outputs."""
import argparse,datetime,hashlib,json,re,shutil,subprocess,os
from pathlib import Path

def prepare(args):
 if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',args.version):raise ValueError('Stable SemVer required')
 project=Path(__file__).resolve().parents[1]
 config=json.loads((project/'src-tauri/tauri.conf.json').read_text())
 if config['version']!=args.version or not config['plugins']['updater']['requireSignedVersion']:raise ValueError('Application config differs')
 if args.destination.exists():raise ValueError('Existing release preserved')
 args.destination.mkdir(parents=True);public=args.destination/'public';downloads=public/'downloads';downloads.mkdir(parents=True);updates=public/'updates';updates.mkdir()
 pubkey=args.destination/'updater.pub';pubkey.write_text(config['plugins']['updater']['pubkey'])
 platforms={};artifacts=[];inventory={}
 entries=[('macos',None,args.mac_dmg,'macOS-Intel.dmg'),('macos-update','darwin-x86_64',args.mac_app,'macOS-Intel.app.tar.gz'),('windows','windows-x86_64',args.windows,'Windows-x64.exe'),('fedora','linux-x86_64-rpm',args.fedora_rpm,'Fedora44-x86_64.rpm')]
 if args.linux_appimage:entries.append(('linux-appimage','linux-x86_64-appimage',args.linux_appimage,'Linux-x86_64.AppImage'))
 cli=project/'node_modules/.bin/tauri'
 for platform,target,source,suffix in entries:
  if source.is_symlink() or not source.is_file():raise ValueError('Regular artifact required')
  name=f'DowzeAcademie-{args.version}-{suffix}';dest=downloads/name;shutil.copy2(source,dest)
  if target:
   result=subprocess.run([str(cli),'signer','sign','-f',str(args.signing_key),'--app-version',args.version,str(dest)],capture_output=True,text=True,env={**os.environ,"TAURI_SIGNING_PRIVATE_KEY_PASSWORD":os.environ.get("TAURI_SIGNING_PRIVATE_KEY_PASSWORD","")})
   if result.returncode:raise RuntimeError('Artifact signing failed')
   sig=Path(str(dest)+'.sig');subprocess.run([str(args.verifier),str(pubkey),str(sig),str(dest),args.version],check=True)
   platforms[target]={'url':'https://academie.dowze.ch/downloads/'+name,'signature':sig.read_text().strip()}
   if target=='linux-x86_64-appimage':platforms['linux-x86_64']=platforms[target]
  with dest.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  if platform!='macos-update':artifacts.append({'platform':platform,'filename':name,'bytes':dest.stat().st_size,'sha256':sha})
  inventory['downloads/'+name]={'bytes':dest.stat().st_size,'sha256':sha}
 latest={'version':args.version,'notes':args.notes,'pub_date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platforms':platforms}
 (updates/'stable.json').write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n')
 (public/'releases.json').write_text(json.dumps({'version':args.version,'artifacts':artifacts},ensure_ascii=False,indent=2)+'\n')
 (public/'SHA256SUMS.txt').write_text(''.join(v['sha256']+'  '+n+'\n' for n,v in inventory.items()))
 for name in ('index.html','site.js'):shutil.copy2(project/'website'/name,public/name)
 (args.destination/'artifacts-proof.json').write_text(json.dumps(inventory,indent=2)+'\n')
 print('Prepared and signed; publication NOT executed:',args.destination)
if __name__=='__main__':
 p=argparse.ArgumentParser()
 p.add_argument('--version',required=True)
 p.add_argument('--notes',required=True)
 for name in ('mac-dmg','mac-app','windows','fedora-rpm','signing-key','verifier','destination'):p.add_argument('--'+name,type=Path,required=True)
 p.add_argument('--linux-appimage',type=Path);prepare(p.parse_args())
