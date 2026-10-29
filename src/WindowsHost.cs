// Original console host: gives a GUI-launched vanilla server a private console
// so CTRL+C can request Valheim's normal save-and-exit path.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
class LongshipWindowsHost {
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AllocConsole();
 [DllImport("kernel32.dll")]static extern IntPtr GetConsoleWindow();
 [DllImport("kernel32.dll")]static extern bool FreeConsole();
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int mode);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GenerateConsoleCtrlEvent(uint type,uint group);
 delegate bool Handler(uint type);
 [DllImport("kernel32.dll")]static extern bool SetConsoleCtrlHandler(Handler handler,bool add);
 static Handler handler=delegate(uint type){return type==0||type==1;};
 static readonly object gate=new object();
 static string Quote(string s){var b=new StringBuilder("\"");int slashes=0;foreach(char c in s){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);slashes=0;continue;}b.Append('\\',slashes);slashes=0;b.Append(c);}b.Append('\\',slashes*2);b.Append('"');return b.ToString();}
 static int Main(string[] args){var input=Console.In;var output=Console.Out;if(args.Length<1)return 64;
  FreeConsole();if(!AllocConsole()){output.WriteLine("HARBOR_ERROR:Unable to allocate a private server console: "+Marshal.GetLastWin32Error());output.Flush();return 65;}ShowWindow(GetConsoleWindow(),0);SetConsoleCtrlHandler(null,false);SetConsoleCtrlHandler(handler,true);
  try{var info=new ProcessStartInfo();info.FileName=args[0];info.WorkingDirectory=System.IO.Path.GetDirectoryName(args[0]);info.UseShellExecute=false;info.CreateNoWindow=false;var b=new StringBuilder();for(int i=1;i<args.Length;i++){if(i>1)b.Append(' ');b.Append(Quote(args[i]));}info.Arguments=b.ToString();
   using(var child=Process.Start(info)){output.WriteLine("HARBOR_CHILD:"+child.Id);output.Flush();var thread=new Thread(delegate(){try{string line;while((line=input.ReadLine())!=null){if(line=="stop"){bool ok=GenerateConsoleCtrlEvent(0,0);lock(gate){output.WriteLine(ok?"HARBOR_STOP_SENT":"HARBOR_ERROR:CTRL+C could not be delivered");output.Flush();}}}}catch{}});thread.IsBackground=true;thread.Start();child.WaitForExit();return child.ExitCode;}
  }catch(Exception e){output.WriteLine("HARBOR_ERROR:"+e.Message);output.Flush();return 66;}
 }
}
