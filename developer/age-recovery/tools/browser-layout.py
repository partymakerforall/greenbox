import json,time
from pathlib import Path
tab=new_tab('http://127.0.0.1:8788/tool');switch_tab(tab);wait_for_load()
checks=[]
for width in [320,390,768,1024,1440,1920]:
 cdp('Emulation.setDeviceMetricsOverride',width=width,height=1000,deviceScaleFactor=1,mobile=False)
 for view in ['key','build','recover']:
  js('document.querySelector('+json.dumps('[data-tab="'+view+'"]')+').click()')
  time.sleep(.1)
  info=js('({width:innerWidth,scroll:document.documentElement.scrollWidth,view:document.querySelector(".view:not([hidden])").id})')
  assert info['scroll']<=width+1,info
  checks.append(info)
 capture_screenshot('/tmp/greenbox-age-layout-'+str(width)+'.png')
Path('developer/checks/recovery-layout.json').write_text(json.dumps(checks,indent=2)+'\n')
cdp('Target.closeTarget',targetId=tab)
print('All 18 recovery view/width checks passed.')
