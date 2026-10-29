using System;
using System.Collections.Generic;
using ValheimHarbor;
class BridgeJsonFixture {
 static void Main(){Console.WriteLine(BridgeJson.Reply(true,null,null));Console.WriteLine(BridgeJson.Reply(true,null,new[]{new KeyValuePair<string,string>("A\"\\\n\u2603\ud83d\ude00",null),new KeyValuePair<string,string>("Viking","Xbox_123")}));Console.WriteLine(BridgeJson.Reply(false,"Unsupported API\nRetry",null));}
}
