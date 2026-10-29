using System;
using System.Collections.Generic;
using System.Text;
namespace ValheimHarbor {
 internal static class BridgeJson {
  static void String(StringBuilder b,string value){if(value==null){b.Append("null");return;}b.Append('"');foreach(char c in value){switch(c){case '"':b.Append("\\\"");break;case '\\':b.Append("\\\\");break;case '\n':b.Append("\\n");break;case '\r':b.Append("\\r");break;case '\t':b.Append("\\t");break;default:if(c<32||c>=127)b.Append("\\u").Append(((int)c).ToString("x4"));else b.Append(c);break;}}b.Append('"');}
  internal static string Reply(bool ok,string error,IEnumerable<KeyValuePair<string,string>> players){var b=new StringBuilder();b.Append("{\"ok\":").Append(ok?"true":"false").Append(",\"error\":");String(b,error);b.Append(",\"players\":[");bool first=true;if(players!=null)foreach(var player in players){if(!first)b.Append(',');first=false;b.Append("{\"name\":");String(b,player.Key);b.Append(",\"platformId\":");String(b,player.Value);b.Append('}');}return b.Append("]}").ToString();}
 }
}
