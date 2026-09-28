"""Run inside browser-harness -c via exec(open(...).read()). Uses a separate QA tab and the current project folder."""
import json
import os
import time
from pathlib import Path

verification_tab = new_tab(os.environ.get('GREENBOX_QA_URL', 'http://127.0.0.1:8788/'))
switch_tab(verification_tab)
wait_for_load()
time.sleep(.2)
checks=[]
try:
    for width in [320,390,768,1024,1440,1920]:
        cdp('Emulation.setDeviceMetricsOverride',width=width,height=900,deviceScaleFactor=1,mobile=False)
        time.sleep(.1)
        result=js('''(async()=>{
          const pages=[...document.querySelectorAll('.page')];
          const failures=[];
          let routes=0;
          for(const page of pages){
            const count=page.querySelectorAll('.wizard-step').length;
            for(let n=1;n<=Math.max(1,count);n++){
              location.hash=page.id+(count?'/'+n:'');
              // Pace real hash navigation below Chrome's navigation-flood limit.
              await new Promise(resolve=>setTimeout(resolve,100));
              routes++;
              if(document.querySelector('.page.active')?.id!==page.id)failures.push('Wrong route: '+page.id);
              if(count&&document.querySelector('.page.active .wizard-step.active')?.dataset.step!==String(n))failures.push('Wrong step: '+page.id+'/'+n);
              for(const image of page.querySelectorAll('.diagram img')){
                image.loading='eager';
                try{await image.decode();}catch{failures.push('Image failed: '+image.dataset.diagramImage);}
                if(!image.naturalWidth||!image.src.startsWith('data:image/png;base64,'))failures.push('Image not embedded: '+image.dataset.diagramImage);
              }
              if(document.documentElement.scrollWidth>innerWidth+1)failures.push('Page overflow: '+page.id+'/'+n);
            }
          }
          return {width:innerWidth,routes,diagrams:document.querySelectorAll('.diagram img').length,failures,remoteResources:performance.getEntriesByType('resource').filter(r=>/^https?:/.test(r.name)).map(r=>r.name)};
        })()''')
        checks.append(result)
        assert not result['failures'], result
finally:
    cdp('Emulation.clearDeviceMetricsOverride')
    cdp('Target.closeTarget', targetId=verification_tab)
Path('developer/checks/browser-layout.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
