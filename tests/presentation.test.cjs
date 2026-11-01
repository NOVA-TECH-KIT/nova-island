const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(vertical=false){
  const source=fs.readFileSync(require.resolve('../nova.js'),'utf8');
  const start=source.indexOf("ipcMain.on('activity-mode'");
  const end=source.indexOf('\nlet nativeGlass',start);
  const calls=[],sent=[];let handler;
  const timeline={to(target,vars){calls.push({target,vars});return this;},play(){this.played=true;},pause(){this.paused=true;},resume(){this.resumed=true;}};
  const sender={};const context={win:{isDestroyed:()=>false,webContents:sender,getBounds:()=>({x:640,y:0,width:640,height:320}),setPosition:(x,y)=>sent.push({x,y})},
    prefs:{vertical},drag:null,activityPresentation:null,islandRect:{y:8},screen:{getDisplayMatching:()=>({bounds:{y:0}})},
    ipcMain:{on:(_channel,fn)=>handler=fn},dockMotion:{timeline:()=>timeline},send:(channel,value)=>sent.push({channel,value}),captureBackdrop:()=>{},
    stopActivityPresentation:()=>{context.activityPresentation=null;}};
  vm.runInNewContext(source.slice(start,end),context);
  return {context,calls,sent,timeline,emit:mode=>handler({sender},mode)};
}
test('pill is revealed with a 24px gap, holds, then attaches using final local geometry',()=>{
  const f=fixture();f.emit('compact');
  assert.equal(f.calls.length,3);
  assert.equal(f.calls[0].vars.y+f.context.islandRect.y,24);
  assert.equal(f.calls[1].vars.duration,1.25);
  assert.equal(f.calls[2].vars.duration,.9);
  assert.equal(f.calls[2].vars.ease,'power3.inOut');
  f.context.islandRect.y=12;
  assert.equal(f.calls[2].vars.y()+12,0);
  assert.ok(f.timeline.played);
  f.emit('expanded');assert.ok(f.timeline.paused);
  f.emit('compact');assert.ok(f.timeline.resumed);
});
test('side placement is respected and normal idle ends the temporary presentation',()=>{
  const side=fixture(true);side.emit('compact');assert.equal(side.calls.length,0);
  const floating=fixture();floating.emit('toast');floating.emit('idle');assert.equal(floating.context.activityPresentation,null);
});
test('a transient non-finite tween value never reaches the native window API',()=>{
  const f=fixture();f.emit('compact');
  const move=f.calls[0];
  move.target.y=NaN;move.vars.onUpdate();
  assert.equal(f.sent.filter(value=>'y' in value).length,0);
  move.target.y=16.8;move.vars.onUpdate();
  assert.equal(f.sent.filter(value=>'y' in value).at(-1).y,17);
});
