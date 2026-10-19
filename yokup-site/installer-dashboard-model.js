// Shared predicates keep ownership and profile writes consistent in every view.
(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.InstallerDashboardModel=model;})(typeof window!=='undefined'?window:globalThis,function(){
 function filterIncidents(list,filter){return list.filter(i=>filter==='available'?i.status==='open'&&!i.mine:filter==='assigned'?i.status==='assigned'&&i.mine:filter==='resolved'?i.status==='resolved'&&i.mine:true);}
 function filterCounts(list){return Object.fromEntries(['available','assigned','resolved','all'].map(f=>[f,filterIncidents(list,f).length]));}
 function profilePatch(profile,changes={}){return {name:profile.name,country:profile.country,city:profile.city,latitude:profile.latitude,longitude:profile.longitude,skills:[...profile.skills],available:changes.available??profile.available,radius_km:profile.radius_km??40,notify_zone:profile.notify_zone??true,demo:profile.demo??false,language:profile.language==='en'?'en':'es'};}
 return {filterIncidents,filterCounts,profilePatch};
});
