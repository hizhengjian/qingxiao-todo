import json,subprocess,time,re,hashlib,os
from pathlib import Path
import xml.etree.ElementTree as ET
SDK=Path(os.environ['ANDROID_HOME'])
ADB=[str(SDK/'platform-tools/adb'),'-s',os.environ.get('QA_SERIAL','emulator-5580')]
PACKAGE='cn.nemo.qingxiao';FILE='/data/data/'+PACKAGE+'/files/tasks.json';OUT=Path(os.environ.get('QINGXIAO_TEST_OUTPUT','test-results/widget-layouts'));OUT.mkdir(parents=True,exist_ok=True)
def adb(*args,input=None,check=True):return subprocess.run(ADB+list(args),input=input,capture_output=True,check=check).stdout
def ui():
 adb('shell','uiautomator','dump','/sdcard/q24-ui.xml');return ET.fromstring(adb('exec-out','cat','/sdcard/q24-ui.xml'))
def nodes():return [(n.get('text'),n.get('content-desc'),n.get('bounds')) for n in ui().iter('node') if n.get('text') or n.get('content-desc')]
def find(label):
 for _ in range(3):
  for n in ui().iter('node'):
   if label in (n.get('text'),n.get('content-desc')) and n.get('bounds')!='[0,0][0,0]':
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));return ((x1+x2)//2,(y1+y2)//2,(x1,y1,x2,y2))
  time.sleep(.3)
 raise AssertionError('UI missing: '+label)
def tap(label):
 x,y,_=find(label);adb('shell','input','tap',str(x),str(y));time.sleep(.4)
def home():adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(.6)
def shot(name):(OUT/name).write_bytes(adb('exec-out','screencap','-p'))
def data():return json.loads(adb('exec-out','cat',FILE))
def launch():adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity');time.sleep(.5)
