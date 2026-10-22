import jpeg from 'npm:jpeg-js@0.4.4';
export const INPUT_LIMIT=262144, OUTPUT_LIMIT=65536;
export class PhotoInputError extends Error { constructor(){super('invalid_photo');} }
const fail=():never=>{throw new PhotoInputError();};
export function decodeBase64(value:string):Uint8Array {
 if(value.length>349528||!value.length||value.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail();
 try{const s=atob(value);if(s.length>INPUT_LIMIT)fail();return Uint8Array.from(s,c=>c.charCodeAt(0));}catch{ return fail(); }
}
export function base64(b:Uint8Array):string {let s='';for(const v of b)s+=String.fromCharCode(v);return btoa(s);}
// Validate segment bounds before decoding/allocation. EXIF is read ONLY for orientation.
export function inspectJpeg(b:Uint8Array,limit=1024):{width:number;height:number;orientation:number;metadata:boolean} {
 if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)fail();
 let p=2,width=0,height=0,orientation=1,metadata=false,seenExif=false;
 while(p<b.length){if(b[p++]!==255)fail();while(b[p]===255)p++;const marker=b[p++];if(marker===218)break;if(marker===217)fail();
  if(marker===0||marker===216||marker>=208&&marker<=215||p+2>b.length)fail();const length=b[p]*256+b[p+1];if(length<2||p+length>b.length)fail();
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(width||length<8)fail();height=b[p+3]*256+b[p+4];width=b[p+5]*256+b[p+6];if(![192,193,194].includes(marker))fail();}
  if(marker===254||marker>=225&&marker<=239)metadata=true;
  if(marker===225&&String.fromCharCode(...b.subarray(p+2,p+8))==='Exif\0\0'){
   if(seenExif)fail();seenExif=true;const start=p+8,end=p+length;const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
   const safe=(o:number,n:number)=>{if(o<start||o+n>end)fail();};safe(start,8);const le=b[start]===73&&b[start+1]===73;if(!le&&!(b[start]===77&&b[start+1]===77))fail();
   const u16=(o:number)=>{safe(o,2);return view.getUint16(o,le);};const u32=(o:number)=>{safe(o,4);return view.getUint32(o,le);};if(u16(start+2)!==42)fail();const ifd=start+u32(start+4),count=u16(ifd);safe(ifd+2,count*12+4);
   for(let i=0;i<count;i++){const e=ifd+2+i*12;if(u16(e)===274){if(u16(e+2)!==3||u32(e+4)!==1)fail();orientation=u16(e+8);if(orientation<1||orientation>8)fail();}}
  }p+=length;
 }
 if(!width||!height||width>limit||height>limit||width*height>1048576)fail();return {width,height,orientation,metadata};
}
export async function normalizePhoto(input:Uint8Array):Promise<{bytes:Uint8Array;width:number;height:number;sha256:string}> {
 const started=performance.now();if(!input.length||input.length>INPUT_LIMIT)fail();const head=inspectJpeg(input);
 try {
  const decoded=jpeg.decode(input,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:1,maxMemoryUsageInMB:32});
  if(decoded.width!==head.width||decoded.height!==head.height)fail();
  const swap=head.orientation>=5,ow=swap?head.height:head.width,oh=swap?head.width:head.height;
  const scale=Math.min(1,256/ow,256/oh),width=Math.max(1,Math.floor(ow*scale)),height=Math.max(1,Math.floor(oh*scale));const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=Math.min(ow-1,Math.floor((x+.5)*ow/width)),v=Math.min(oh-1,Math.floor((y+.5)*oh/height));let sx=u,sy=v;
   switch(head.orientation){case 2:sx=head.width-1-u;break;case 3:sx=head.width-1-u;sy=head.height-1-v;break;case 4:sy=head.height-1-v;break;case 5:sx=v;sy=u;break;case 6:sx=v;sy=head.height-1-u;break;case 7:sx=head.width-1-v;sy=head.height-1-u;break;case 8:sx=head.width-1-v;sy=u;break;}
   const i=(sy*head.width+sx)*4;data.set(decoded.data.subarray(i,i+4),(y*width+x)*4);
  }
  let bytes:Uint8Array=new Uint8Array();for(const quality of [85,70,55,40]){bytes=new Uint8Array(jpeg.encode({data,width,height},quality).data);if(bytes.length<=OUTPUT_LIMIT)break;}
  if(bytes.length>OUTPUT_LIMIT||performance.now()-started>1500)fail();const output=inspectJpeg(bytes,256);if(output.metadata||output.width!==width||output.height!==height)fail();
  const verify=jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:1,maxMemoryUsageInMB:32});if(verify.width!==width||verify.height!==height)fail();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  return {bytes,width,height,sha256};
 }catch {return fail();}
}
