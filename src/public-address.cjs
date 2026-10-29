const {isIP}=require('node:net');
let cached=null,pending=null;
async function publicAddress({fetchImpl=fetch,now=Date.now,force=false}={}){
 if(!force&&cached&&now()-cached.time<300000)return cached.ip;
 if(pending)return pending;
 pending=(async()=>{const response=await fetchImpl('https://api.ipify.org',{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw Error('Public IP lookup unavailable.');const ip=(await response.text()).trim();if(!isIP(ip))throw Error('Public IP lookup returned an invalid address.');cached={ip,time:now()};return ip;})();
 try{return await pending;}finally{pending=null;}
}
module.exports={publicAddress};
