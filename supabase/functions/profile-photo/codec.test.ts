import clientFixture from './fixtures/client-conversion.json' with {type:'json'};
import jpeg from 'npm:jpeg-js@0.4.4';
import {normalizePhoto,inspectJpeg,decodeBase64,base64,PhotoInputError} from '../_shared/profile-photo/imageCodec.ts';
function ok(v:unknown,m:string){if(!v)throw Error(m);}
const fixture=(w=80,h=40)=>{const data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(x<w/2?(y<h/2?[240,15,15,255]:[15,15,240,255]):(y<h/2?[15,240,15,255]:[240,240,15,255]),(y*w+x)*4);return new Uint8Array(jpeg.encode({data,width:w,height:h},90).data);};
function oriented(b:Uint8Array,o:number){const exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,o,0,0,0,0,0,0,0]);const comment=new Uint8Array([255,254,0,12,...new TextEncoder().encode('GPS=secret')]);return new Uint8Array([...b.slice(0,2),...exif,...comment,...b.slice(2)]);}
Deno.test('C0 true Deno decode/orientations 1..8/reencode/metadata removal',async()=>{
 const input=fixture();const expected=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]];const colors=[[240,15,15],[15,240,15],[15,15,240],[240,240,15]];
 for(let o=1;o<=8;o++){const source=oriented(input,o),r=await normalizePhoto(source),head=inspectJpeg(r.bytes,256);ok(!head.metadata,'metadata removed');ok(r.width===(o>=5?40:80)&&r.height===(o>=5?80:40),'orientation dimensions');const d=jpeg.decode(r.bytes,{useTArray:true});for(const [i,[x,y]]of [[0,[.2,.2]],[1,[.8,.2]],[2,[.2,.8]],[3,[.8,.8]]] as const){const offset=(Math.floor(y*d.height)*d.width+Math.floor(x*d.width))*4;const wanted=colors[expected[o-1][i]];ok(wanted.every((v,c)=>Math.abs(v-d.data[offset+c])<45),'orientation pixels '+o+' '+i);}ok(!new TextDecoder().decode(r.bytes).includes('GPS=secret'),'no secret comment');}
});
Deno.test('C0 dimension/bytes limits and real output decode',async()=>{const r=await normalizePhoto(fixture(1024,512));ok(r.width===256&&r.height===128&&r.bytes.length<=65536,'bounded output');ok(decodeBase64(base64(fixture())).length>0,'base64');});
Deno.test('C0 explicit malformed/oversized/relabelled refusal controls',async()=>{for(const b of [new Uint8Array(),fixture().slice(0,-10),new Uint8Array(262145),fixture(1025,1),new Uint8Array([137,80,78,71,255,217]),new Uint8Array([255,216,255,225,255,255,255,217])]){let denied=false;try{await normalizePhoto(b);}catch(e){denied=e instanceof Error&&e.message==='invalid_photo';}ok(denied,'explicit invalid_photo');}for(const s of ['bad','AAAA','====','A'.repeat(349532)]){let denied=false;try{const b=decodeBase64(s);await normalizePhoto(b);}catch(e){denied=e instanceof Error&&e.message==='invalid_photo';}ok(denied,'bad base64');}});
Deno.test('C0 genuine EXIF GPS IFD removed from freshly encoded thumbnail',async()=>{
 const tiff=new Uint8Array(140),v=new DataView(tiff.buffer);const u16=(p:number,n:number)=>v.setUint16(p,n,true),u32=(p:number,n:number)=>v.setUint32(p,n,true);tiff[0]=73;tiff[1]=73;u16(2,42);u32(4,8);u16(8,2);
 const entry=(p:number,tag:number,type:number,count:number,value:number)=>{u16(p,tag);u16(p+2,type);u32(p+4,count);u32(p+8,value);};entry(10,274,3,1,6);entry(22,34853,4,1,38);u16(38,4);entry(40,1,2,2,78);entry(52,2,5,3,92);entry(64,3,2,2,69);entry(76,4,5,3,116);
 for(const[i,n]of [25,2,0,121,33,0].entries()){u32(92+i*8,n);u32(96+i*8,1);}const exif=new Uint8Array([255,225,0,148,69,120,105,102,0,0,...tiff]),jpeg=fixture(),source=new Uint8Array([...jpeg.slice(0,2),...exif,...jpeg.slice(2)]);ok(inspectJpeg(source).metadata,'real GPS EXIF present');const r=await normalizePhoto(source);ok(r.width===40&&r.height===80&&!inspectJpeg(r.bytes).metadata,'GPS container absent after true reencoding');
});

Deno.test('F1 approved 1048576-pixel boundaries decode with decimal MP guard retained',async()=>{
 for(const [w,h,ew,eh]of [[1024,1024,256,256],[1000,1000,256,256],[1000,1001,255,256],[1024,976,256,244],[1024,977,256,244]]){const b=fixture(w,h);ok(b.length<=262144,'size fixture within independent byte cap '+w+'x'+h);let r;try{r=await normalizePhoto(b);}catch(e){if(e instanceof PhotoInputError)throw Error('F1 valid approved '+w+'x'+h+' rejected by codec');throw e;}ok(r.width===ew&&r.height===eh,'approved boundary accepted '+w+'x'+h);}
 for(const o of [5,6,7,8]){const r=await normalizePhoto(oriented(fixture(1024,977),o));ok(r.width===244&&r.height===256,'boundary EXIF swap '+o);}
});
Deno.test('F1 predecode edge pixel capacity and malformed-header controls remain effective',async()=>{
 const valid=fixture(1024,1024);const pad=(target:number)=>{const chunks=[valid.slice(0,2)];let left=target-valid.length;while(left){const n=Math.min(65537,left);ok(n>=4,'valid COM segment length');const part=new Uint8Array(n);part.set([255,254,(n-2)>>8,(n-2)&255]);chunks.push(part);left-=n;}chunks.push(valid.slice(2));const result=new Uint8Array(target);let p=0;for(const c of chunks){result.set(c,p);p+=c.length;}return result;};
 const atBytes=pad(262144);ok((await normalizePhoto(atBytes)).width===256,'exact256KiB genuine JPEG accepted');
 const overBytes=pad(262145),overEdge=fixture(1025,1),overPixels=fixture(1025,1024),badHeader=new Uint8Array([255,216,255,192,0,17,8,4,0,4,0,3,1,17,0,2,17,1,3,17,1,255,217]);
 const original=jpeg.decode;let calls=0;jpeg.decode=((...args:Parameters<typeof original>)=>{calls++;return original(...args);}) as typeof original;
 try{for(const b of [overBytes,overEdge,overPixels,badHeader]){let refused=false;try{await normalizePhoto(b);}catch(e){refused=e instanceof Error&&e.message==='invalid_photo';}ok(refused,'explicit over-limit/malformed refusal');}ok(calls===0,'all rejected before real decode/allocation');}finally{jpeg.decode=original;}
});

Deno.test('F1 actual client Expo Web conversion bytes accepted by real Deno codec',async()=>{for(const sample of clientFixture.results){const bytes=decodeBase64(sample.jpegBase64),head=inspectJpeg(bytes),result=await normalizePhoto(bytes);ok(head.width===1024&&head.height===sample.conversion.height,'actual client header');ok(result.width===256&&result.height===(head.height===1024?256:128),'actual client bounded decode result');}});
