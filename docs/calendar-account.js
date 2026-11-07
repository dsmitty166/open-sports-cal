/* Public project configuration. Secret/service-role keys never belong here. */
(function(root){
  'use strict';
  try{
    const client=root.supabase.createClient('https://mmrqhwxuasrxwajxulms.supabase.co','sb_publishable_B1Fopq3N33wjsufeOxuiqg_Bdt5KSs5',{
      auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}
    });
    root.CalendarAccount={client,ready:client.auth.getSession()};
  }catch(_){root.CalendarAccount={ready:Promise.resolve({data:{session:null},error:Error('Account sign-in is unavailable. Device calendars still work.')})};}
})(globalThis);
