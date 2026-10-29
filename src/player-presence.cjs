class PlayerPresence {
 constructor(){this.sessions=new Map();}
 reset(id){this.sessions.delete(id);}
 observe(id,session,players){const counts=new Map();for(const p of players){const key=p.platformId?'id:'+p.platformId:'name:'+p.name;counts.set(key,(counts.get(key)||0)+1);}const previous=this.sessions.get(id);this.sessions.set(id,{session,counts});if(!previous||previous.session!==session)return 0;let joined=0;for(const [key,count]of counts)joined+=Math.max(0,count-(previous.counts.get(key)||0));return joined;}
}
module.exports={PlayerPresence};
