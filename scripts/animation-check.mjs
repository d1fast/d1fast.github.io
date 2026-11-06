// Поведение при системной настройке уменьшения движения, без WebGL и при потере контекста.
import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const base=process.env.CHECK_URL||'http://127.0.0.1:4322';
const browser=await launchBrowser();const errors=[];
try{
 for(const software of [false,true]){
  const ctx=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  if(software)await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:get.call(this,type,...args)}});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.hero.has-garden').waitFor();
  await page.mouse.move(120,300);await page.mouse.move(160,300);await page.waitForTimeout(3800);
  assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  const garden=page.locator('[data-hero-garden]');
  const first=await garden.screenshot();await page.waitForTimeout(1400);
  assert.equal(first.equals(await garden.screenshot()),false,'Птица и листья двигаются при reduce');
  if(!software){
   await page.locator('.hero__garden canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
   await page.locator('.hero__garden svg').waitFor();
   const before=await page.locator('.hero__garden svg').innerHTML();await page.waitForTimeout(1100);
   assert.notEqual(await page.locator('.hero__garden svg').innerHTML(),before,'После потери WebGL продолжается живая SVG-сцена');
  }
  await page.screenshot({path:`shots/motion-reduce-${software?'svg':'webgl'}.png`});await ctx.close();
  console.log(software?'reduce + отключённый WebGL: анимация работает':'reduce + потеря WebGL: анимация работает');
 }
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?playlist#services`);await page.locator('#services.is-current').waitFor();
 await page.evaluate(()=>{
  window.playlist=[];const root=document.querySelector('#services');
  const sample=()=>{const current=root.querySelector('[data-svc-w].is-shown')?.dataset.svcW;if(current&&window.playlist.at(-1)!==current)window.playlist.push(current)};
  new MutationObserver(sample).observe(root,{subtree:true,attributes:true,attributeFilter:['class']});sample();
 });
 await page.locator('[data-services-screen]').hover();await page.mouse.move(1000,450);await page.mouse.move(1005,450);
 await page.locator('#works.is-current').waitFor({timeout:95000});
 assert.deepEqual(await page.evaluate(()=>window.playlist),['sites','dash','devices','bots','product','promo']);
 assert.deepEqual(errors,[]);
 console.log('Шесть сцен без остановок при наведении, затем переход к работам. Ошибок JavaScript нет');
}finally{await browser.close()}
