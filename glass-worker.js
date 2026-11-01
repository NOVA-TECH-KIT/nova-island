// Exact reference map math, evaluated off the renderer's UI thread.
importScripts('liquid-glass.js');
self.postMessage({ready:true});
self.onmessage=({data})=>{
  try {
    const map=self.FlintGlassMath.displacement(data.w,data.h,data.radii,data.material,data.scale);
    self.postMessage({id:data.id,...map},[map.pixels.buffer]);
  } catch(error){self.postMessage({id:data.id,error:String(error)});}
};
