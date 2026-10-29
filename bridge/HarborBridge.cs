using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using BepInEx;
using UnityEngine;

namespace ValheimHarbor {
 [BepInPlugin("games.valheimharbor.bridge", "Longship Bridge", "0.2.0")]
 public sealed class HarborBridge : BaseUnityPlugin {
  [Serializable] public class Player { public string name; public string platformId; }
  [Serializable] public class Reply { public bool ok=true; public string error; public List<Player> players; }
  [Serializable] public class Kick { public string name; }
  sealed class Pending { public TcpClient context; public string action; public string body; public long deadline; }
  readonly ConcurrentQueue<Pending> queue=new ConcurrentQueue<Pending>();
  TcpListener listener; Thread thread; string token; int queued; bool quitting;
  const BindingFlags Flags=BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static;
  void Awake() {
   token=Environment.GetEnvironmentVariable("VH_HARBOR_TOKEN");
   int port;
   if(string.IsNullOrEmpty(token)||token.Length<32||!int.TryParse(Environment.GetEnvironmentVariable("VH_HARBOR_PORT"),out port)||port<1024||port>65535){Logger.LogInfo("Longship bridge disabled: launch using Harbor to supply port/token.");return;}
   try {listener=new TcpListener(IPAddress.Loopback,port);listener.Start(16);thread=new Thread(Listen);thread.IsBackground=true;thread.Start();Logger.LogInfo("Longship bridge listening on loopback port "+port+" (token hidden).");}catch(Exception e){Logger.LogError("Longship bridge unavailable: "+e.Message);}
  }
  void Listen(){while(listener!=null){TcpClient c;try{c=listener.AcceptTcpClient();}catch{return;}
   try {c.ReceiveTimeout=2000;c.SendTimeout=2000;var stream=c.GetStream();var header=new List<byte>();int value;while((value=stream.ReadByte())>=0){header.Add((byte)value);if(header.Count>8192)throw new InvalidOperationException("Header too large");int count=header.Count;if(count>=4&&header[count-4]==13&&header[count-3]==10&&header[count-2]==13&&header[count-1]==10)break;}
    var lines=Encoding.ASCII.GetString(header.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None);var request=lines[0].Split(' ');if(request.Length!=3)throw new InvalidOperationException("Invalid request");var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(var line in lines.Skip(1)){var at=line.IndexOf(':');if(at>0)headers[line.Substring(0,at).Trim()]=line.Substring(at+1).Trim();}
    string auth;if(!headers.TryGetValue("Authorization",out auth)||auth!="Bearer "+token){Send(c,401,"{\"error\":\"Unauthorized\"}");continue;}
    string action=request[1].Trim('/');if((action=="players"&&request[0]!="GET")||(action!="players"&&request[0]!="POST")){Send(c,405,"{\"error\":\"Method not allowed\"}");continue;}
    if(!new[]{"players","kick","save","stop"}.Contains(action)){Send(c,404,"{\"error\":\"Unknown action\"}");continue;}
    int length=0;string text;if(headers.ContainsKey("Transfer-Encoding")||(headers.TryGetValue("Content-Length",out text)&&(!int.TryParse(text,out length)||length<0||length>2048))){Send(c,413,"{\"error\":\"Invalid body length\"}");continue;}
    var bytes=new byte[length];int read=0;while(read<length){int got=stream.Read(bytes,read,length-read);if(got==0)throw new IOException("Incomplete request");read+=got;}
    if(Interlocked.Increment(ref queued)>16){Interlocked.Decrement(ref queued);Send(c,429,"{\"error\":\"Queue full\"}");continue;}
    queue.Enqueue(new Pending{context=c,action=action,body=Encoding.UTF8.GetString(bytes),deadline=DateTime.UtcNow.AddSeconds(5).Ticks});
   }catch{Send(c,400,"{\"error\":\"Invalid request\"}");}
  }}
  static Type Find(string name){return AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name,false)).FirstOrDefault(t=>t!=null);}
  static object Read(object obj,string name){if(obj==null)return null;var t=obj as Type??obj.GetType();var f=t.GetField(name,Flags);if(f!=null)return f.GetValue(obj is Type?null:obj);var p=t.GetProperty(name,Flags);return p==null?null:p.GetValue(obj is Type?null:obj,null);}
  static object Net(){var t=Find("ZNet");var n=Read(t,"instance")??Read(t,"m_instance");if(n==null)throw new InvalidOperationException("ZNet is not ready.");return n;}
  static MethodInfo Method(object n,string name,params Type[] types){var m=n.GetType().GetMethod(name,Flags,null,types,null);if(m==null)throw new InvalidOperationException("Unsupported Valheim API: "+name);return m;}
  static void Save(object net){var methods=net.GetType().GetMethods(Flags).Where(m=>m.Name=="Save").ToArray();var old=methods.FirstOrDefault(m=>m.GetParameters().Length==1&&m.GetParameters()[0].ParameterType==typeof(bool));if(old!=null){old.Invoke(net,new object[]{true});return;}var current=methods.FirstOrDefault(m=>m.GetParameters().Length==3&&m.GetParameters().All(p=>p.ParameterType==typeof(bool))&&m.GetParameters().Skip(1).All(p=>p.IsOptional&&p.DefaultValue is bool));if(current==null)throw new InvalidOperationException("Unsupported Valheim Save signature.");var parameters=current.GetParameters();current.Invoke(net,new object[]{true,parameters[1].DefaultValue,parameters[2].DefaultValue});}
  void Update(){Pending p;int budget=4;while(budget-->0&&queue.TryDequeue(out p)){Interlocked.Decrement(ref queued);if(p.deadline<DateTime.UtcNow.Ticks){Send(p.context,408,"{\"error\":\"Request expired before execution\"}");continue;}try{var n=Net();if(!(bool)Method(n,"IsServer").Invoke(n,null))throw new InvalidOperationException("Dedicated server required.");var reply=new Reply();
   if(p.action=="players") {reply.players=new List<Player>();var list=Method(n,"GetPlayerList").Invoke(n,null) as IEnumerable;if(list==null)throw new InvalidOperationException("Player list unavailable.");foreach(var player in list){var name=Convert.ToString(Read(player,"m_name"));if(string.IsNullOrWhiteSpace(name))continue;var info=Read(player,"m_userInfo");var identity=Read(info,"m_id");var host=identity==null?Convert.ToString(Read(player,"m_host")):identity.ToString();string id=null;if(!string.IsNullOrEmpty(host)&&new[]{"Steam_","Xbox_","PlayFab_","PSN_","Apple_"}.Any(prefix=>host.StartsWith(prefix,StringComparison.Ordinal)))id=host;reply.players.Add(new Player{name=name,platformId=id});}}
   else if(p.action=="kick"){var req=JsonUtility.FromJson<Kick>(p.body);if(req==null||string.IsNullOrWhiteSpace(req.name)||req.name.Length>128)throw new InvalidOperationException("Player name required.");var list=Method(n,"GetPlayerList").Invoke(n,null) as IEnumerable;int matches=0;foreach(var player in list)if(Convert.ToString(Read(player,"m_name"))==req.name)matches++;if(matches!=1)throw new InvalidOperationException("Player name is absent or ambiguous. Refresh the player list.");Method(n,"Kick",typeof(string)).Invoke(n,new object[]{req.name});}
   else if(p.action=="save")Save(n);
   else if(p.action=="stop"){Save(n);quitting=true;}
   Send(p.context,200,JsonUtility.ToJson(reply));if(quitting){Application.Quit();return;}
  }catch(Exception e){var inner=e.InnerException??e;Send(p.context,409,JsonUtility.ToJson(new Reply{ok=false,error=inner.Message}));}}}
  static void Send(TcpClient c,int status,string json){try{var body=Encoding.UTF8.GetBytes(json);var header=Encoding.ASCII.GetBytes("HTTP/1.1 "+status+" Result\r\nContent-Type: application/json\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\n\r\n");using(c){var stream=c.GetStream();stream.Write(header,0,header.Length);stream.Write(body,0,body.Length);}}catch{try{c.Close();}catch{}}}
  void OnDestroy(){try{if(listener!=null)listener.Stop();}catch{}Pending p;while(queue.TryDequeue(out p))Send(p.context,503,"{\"error\":\"Bridge stopped\"}");}
 }
}
