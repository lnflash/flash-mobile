#!/usr/bin/env python3
"""Reproduce the pinned optional speech pack outside the source tree.
Run in the isolated audition venv. No Python dependencies ship in Flash.
"""
import argparse, pathlib, json, hashlib, shutil, importlib.resources, sys, urllib.request
from misaki import en, data
from misaki.espeak import EspeakFallback
repo=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'scripts/voice-audition'))
from generate import fetch, MODEL_SHA, VOICES
parser=argparse.ArgumentParser()
parser.add_argument('--assets',type=pathlib.Path,required=True)
parser.add_argument('--output',type=pathlib.Path,required=True)
args=parser.parse_args()
root=args.assets;pack=args.output
root.mkdir(parents=True,exist_ok=True);pack.mkdir(parents=True,exist_ok=True)
shutil.copyfile(fetch(root,'onnx/model_quantized.onnx',MODEL_SHA),pack/'model.onnx')
for voice,digest in VOICES:shutil.copyfile(fetch(root,f'voices/{voice}.bin',digest),pack/f'{voice}.bin')
G2P_REV='4b3a605d2f605318ab4f762ab9855c44106528b7'
for remote,local,digest in [
 ('misaki-en_us-g2p.onnx','misaki-model.onnx','757759c3e3ccb0bf59c379b1671c9834a27543ceaefd6846850823633b9665a1'),
 ('misaki-en_us-g2p.json','misaki-config.json','8a8e3350713b0a00102425a5d5bd6b58b34854c74a3e8d837589f55212c51658')]:
 path=root/local
 if not path.exists():urllib.request.urlretrieve(f'https://huggingface.co/nekwo/misaki-en-us-g2p-onnx/resolve/{G2P_REV}/{remote}',path)
 if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Source hash mismatch')
shutil.copyfile(root/'misaki-model.onnx',pack/'g2p.onnx')
meta=json.loads((root/'misaki-config.json').read_text());meta.pop('silver');meta.pop('gold')
lexicons={}
for loc in ['us','gb']:
 with importlib.resources.open_text(data,f'{loc}_gold.json') as f:values=json.load(f)
 lexicons[loc]={k:(v.get('DEFAULT') if isinstance(v,dict) else v) for k,v in values.items()}
 # App-specific terms use the same source frontend as the accepted samples.
 for word in ['Flash','flash','satoshi','satoshis','USDT','Bitcoin','bitcoin']:
  g=en.G2P(british=loc=='gb',fallback=EspeakFallback(british=loc=='gb'))
  lexicons[loc][word]=g(word)[0]
texts=json.loads((repo/'scripts/voice-pack/sentences.json').read_text())
cache={}
for loc in ['us','gb']:
 g=en.G2P(british=loc=='gb',fallback=EspeakFallback(british=loc=='gb'))
 cache[loc]={}
 for text in sorted(texts):
  ps,_=g(text)
  if all(c in meta['kokoro_vocab'] for c in ps):cache[loc][text]=ps
 print(loc,'cached phrases',len(cache[loc]),flush=True)
meta.update({'lexicons':lexicons,'sentences':cache,'format':1})
(pack/'frontend.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')))
files=[]
for p in sorted(pack.iterdir()):
 item={'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()};files.append(item);print(item,flush=True)
(args.output.parent/'manifest.json').write_text(json.dumps({'version':'kokoro-en-v1','files':files},indent=2)+'\n')

expected=json.loads((repo/'scripts/voice-pack/manifest.json').read_text())
actual={'version':'kokoro-en-v1','files':files}
if actual!=expected:raise ValueError('Generated pack differs from pinned manifest; review and version the pack before shipping')
print('All six asset hashes match the compiled pack manifest')
