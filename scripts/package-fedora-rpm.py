"""Build the Fedora RPM with streaming system tools; never install it."""
import argparse,json,os,shutil,struct,subprocess
from pathlib import Path

def bundle_marker(path):
 data=path.read_bytes()
 if data[:6]!=b'\x7fELF\x02\x01':raise ValueError('ELF64 little-endian required')
 phoff=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
 segments=[struct.unpack_from('<IIQQQQQQ',data,phoff+i*size) for i in range(count)]
 def offset(address):
  found=[v[2]+address-v[3] for v in segments if v[0]==1 and v[3]<=address<v[3]+v[5]]
  if len(found)!=1:raise ValueError('Unmapped ELF address')
  return found[0]
 symbols=subprocess.check_output(['nm',str(path)],text=True)
 names=[line for line in symbols.splitlines() if '__TAURI_BUNDLE_TYPE' in line.split()[-1]]
 if len(names)!=1:raise ValueError('Unique Tauri bundle symbol required')
 ptr,length=struct.unpack_from('<QQ',data,offset(int(names[0].split()[0],16)))
 marker_offset=offset(ptr);marker=data[marker_offset:marker_offset+length]
 if length!=len(b'__TAURI_BUNDLE_TYPE_VAR_UNK') or marker not in [b'__TAURI_BUNDLE_TYPE_VAR_'+x for x in (b'UNK',b'APP',b'RPM')]:raise ValueError('Unexpected Tauri marker')
 return data,marker_offset,marker

def build(args):
 if args.destination.exists():raise ValueError('Existing attempt preserved')
 config=json.loads((Path(__file__).resolve().parents[1]/'src-tauri/tauri.conf.json').read_text())
 version=config['version']
 if not all(c in '0123456789.' for c in version):raise ValueError('Stable numeric version required')
 dest=args.destination.resolve()
 if any(c in str(dest) for c in '\n%\"'):raise ValueError('Unsafe RPM build path')
 dest.mkdir(parents=True)
 stage=dest/'stage';shutil.copytree(args.data_dir,stage,symlinks=True)
 binary=stage/'usr/bin/dowze-academie'
 original,offset,marker=bundle_marker(binary)
 # Same fixed-length metadata token as the official Tauri bundler, only in this copy.
 expected=original[:offset]+b'__TAURI_BUNDLE_TYPE_VAR_RPM'+original[offset+len(marker):]
 with binary.open('r+b') as out:out.seek(offset);out.write(b'__TAURI_BUNDLE_TYPE_VAR_RPM');out.flush();os.fsync(out.fileno())
 if binary.read_bytes()!=expected:raise ValueError('Bundle marker verification failed')
 spec=dest/'dowze-academie.spec'
 spec.write_text(f'''%global debug_package %{{nil}}
%global __os_install_post %{{nil}}
%global _build_id_links none
%global __requires_exclude_from ^/usr/lib/.*$
%global __provides_exclude_from ^/usr/lib/.*$
Name: dowze-academie
Version: {version}
Release: 1
Summary: Dowze Academie desktop learning workspace
License: MIT
URL: https://academie.delez.ovh
BuildArch: x86_64
Requires: gtk3, webkit2gtk4.1, libsecret, libxcrypt-compat

%description
Dowze Academie desktop, annual formations, Hermes curriculum workshop
and signed in-application updates. Bundled Python runtime and model assets.

%prep
%build
%install
mkdir -p "%{{buildroot}}"
cp -a "{stage}/usr" "%{{buildroot}}/"

%files
%defattr(-,root,root,-)
/usr/bin/dowze-academie
"/usr/lib/Dowze Academie"
"/usr/share/applications/Dowze Academie.desktop"
/usr/share/icons/hicolor/*/apps/dowze-academie.png
''')
 subprocess.run(['rpmbuild','-bb','--define',f'_topdir {dest}/rpmbuild','--define',f'_rpmdir {dest}/packages','--define','_binary_payload w3.zstdio','--define','_smp_ncpus_max 1',str(spec)],check=True)
 packages=list((dest/'packages').rglob('*.rpm'))
 if len(packages)!=1:raise ValueError('Unique RPM required')
 rpm=packages[0];subprocess.run(['rpm','--checksig','--nosignature',str(rpm)],check=True)
 extracted=dest/'binary-from-rpm'
 with extracted.open('wb') as out:
  incoming=subprocess.Popen(['rpm2cpio',str(rpm)],stdout=subprocess.PIPE)
  try:
   unpack=subprocess.run(['cpio','-i','--to-stdout','*/bin/dowze-academie'],stdin=incoming.stdout,stdout=out,check=True)
   incoming.stdout.close()
   if incoming.wait()!=0:raise ValueError('RPM payload decoding failed')
  finally:
   if incoming.poll() is None:incoming.terminate();incoming.wait()
 actual,_,actual_marker=bundle_marker(extracted)
 if actual!=expected or actual_marker!=b'__TAURI_BUNDLE_TYPE_VAR_RPM':raise ValueError('Packaged RPM binary differs')
 (dest/'proof.json').write_text(json.dumps({'version':version,'package':str(rpm),'bundle_type':'rpm','binary_preserved_except_bundle_token':True,'rpm_payload_binary_verified':True,'installed':False},indent=2)+'\n')
 print('PASS: RPM created, digest and exact bundled binary verified; not installed:',rpm)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--data-dir',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);build(p.parse_args())
