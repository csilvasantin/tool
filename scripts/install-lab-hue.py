#!/usr/bin/env python3
"""Install the single fixed-Lab actuator; configuration and secrets stay in vault."""
import os, pathlib, plistlib, shutil, subprocess
home=pathlib.Path.home();root=home/'agent-tools/lab-hue';root.mkdir(parents=True,exist_ok=True)
script=root/'lab-hue-controller.py';shutil.copy2(pathlib.Path(__file__).with_name('lab-hue-controller.py'),script);script.chmod(0o700)
state=home/'.config/admiranext/lab-hue';state.mkdir(parents=True,exist_ok=True,mode=0o700)
label='com.admira.lab-hue';service='gui/'+str(os.getuid())+'/'+label
plist={'Label':label,'ProgramArguments':['/opt/homebrew/bin/python3','-u',str(script)],'RunAtLoad':True,'KeepAlive':{'SuccessfulExit':False},'ThrottleInterval':10,
 # Latency-sensitive actuator, no windows/focus. Background QoS delayed polling on the Lab Mac.
 'ProcessType':'Interactive','StandardOutPath':str(state/'controller.log'),'StandardErrorPath':str(state/'controller-error.log')}
p=home/'Library/LaunchAgents'/ (label+'.plist');p.write_bytes(plistlib.dumps(plist));p.chmod(0o600)
if subprocess.run(['launchctl','print',service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:subprocess.run(['launchctl','bootout',service],check=True)
subprocess.run(['launchctl','bootstrap','gui/'+str(os.getuid()),str(p)],check=True)
print('Lab Hue installed; credentials resolved from vault at startup.')
