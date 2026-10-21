using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
internal static class VideoFrameSmoke
{
    private static int checks,exit=1;
    private static void Check(bool ok,string why){if(!ok)throw new Exception(why);checks++;Console.WriteLine("PASS "+why);}
    [STAThread] private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        using(Form form=new Form())using(WebView2 view=new WebView2())
        {
            form.ClientSize=new Size(800,600);form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-30000,-30000);view.Dock=DockStyle.Fill;form.Controls.Add(view);
            form.Shown+=async delegate
            {
                try
                {
                    Assembly app=Assembly.LoadFrom(args[0]);BindingFlags flags=BindingFlags.Static|BindingFlags.NonPublic;
                    MethodInfo crop=app.GetType("VideoFrameBounds",true).GetMethod("Crop",flags);
                    Rectangle pixels=(Rectangle)crop.Invoke(null,new object[]{new RectangleF(10,20,320,180),new SizeF(800,600),new Size(1600,1200)});
                    Check(pixels==new Rectangle(20,40,640,360),"CSS crop maps to actual device pixels at 200% scale");
                    bool rejected=false;try{crop.Invoke(null,new object[]{new RectangleF(-1,20,320,180),new SizeF(800,600),new Size(800,600)});}catch(TargetInvocationException){rejected=true;}
                    Check(rejected,"Offscreen crop is rejected rather than capturing another area");
                    var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Path.GetDirectoryName(args[0]),"video-test-profile"),new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"));
                    await view.EnsureCoreWebView2Async(env);
                    var streams=new List<MemoryStream>();
                    string child="<html><body style='margin:0;background:black'><canvas width='320' height='180' hidden></canvas><video autoplay muted playsinline style='width:100vw;height:100vh;object-fit:fill'></video><script>const c=document.querySelector('canvas'),g=c.getContext('2d'),v=document.querySelector('video');let color='red';function paint(){g.fillStyle=color;g.fillRect(0,0,320,180);requestAnimationFrame(paint)}paint();v.srcObject=c.captureStream(30);v.play().then(()=>parent.postMessage('ready','*'));addEventListener('message',e=>{if(e.data==='blue'){color='blue';setTimeout(()=>parent.postMessage('blue','*'),250)}});</script></body></html>";
                    view.CoreWebView2.AddWebResourceRequestedFilter("https://player.bilibili.com/*",CoreWebView2WebResourceContext.All);
                    view.CoreWebView2.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){var bytes=new MemoryStream(Encoding.UTF8.GetBytes(child));streams.Add(bytes);e.Response=env.CreateWebResourceResponse(bytes,200,"OK","Content-Type: text/html; charset=utf-8");};
                    view.NavigateToString("<html><body style='margin:0;background:yellow'><iframe data-sb-video-capture='smoke-frame' style='position:absolute;left:80px;top:90px;width:320px;height:180px;border:0' src='https://player.bilibili.com/smoke'></iframe><script>window.phase='';addEventListener('message',e=>{if(e.source===document.querySelector('iframe').contentWindow)window.phase=e.data});</script></body></html>");
                    await Wait(view,"ready");await Task.Delay(400);
                    MethodInfo capture=app.GetType("Launcher",true).GetMethod("CaptureVideoFrameDataAsync",flags);
                    string first=await (Task<string>)capture.Invoke(null,new object[]{view,"smoke-frame"});
                    using(Bitmap shot=Decode(first)) {Color color=shot.GetPixel(shot.Width/2,shot.Height/2);Check(color.R>180&&color.G<80&&color.B<80,"Cross-origin video CURRENT red frame captured, not page background or cover");Check(shot.Width>=300&&shot.Height>=170,"Capture contains the player region only");if(args.Length>1)shot.Save(args[1]);}
                    await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('iframe').contentWindow.postMessage('blue','*')");await Wait(view,"blue");await Task.Delay(400);
                    string second=await (Task<string>)capture.Invoke(null,new object[]{view,"smoke-frame"});
                    using(Bitmap shot=Decode(second)){Color color=shot.GetPixel(shot.Width/2,shot.Height/2);Check(color.B>180&&color.R<80&&color.G<80,"Second click captures the NEW blue video frame, not a stale image");}
                    foreach(var stream in streams)stream.Dispose();Console.WriteLine("Native video assertions: "+checks);exit=0;
                }
                catch(Exception e){Console.Error.WriteLine(e.ToString());exit=1;}
                finally {form.Close();}
            };
            Application.Run(form);
        }
        return exit;
    }
    private static async Task Wait(WebView2 view,string phase)
    {for(int i=0;i<100;i++){if(await view.CoreWebView2.ExecuteScriptAsync("window.phase")=="\""+phase+"\"")return;await Task.Delay(100);}throw new Exception("Video fixture did not become ready: "+phase);}
    private static Bitmap Decode(string json)
    {var data=new JavaScriptSerializer(){MaxJsonLength=6000000}.Deserialize<Dictionary<string,object>>(json);string image=(string)data["dataUrl"];using(var stream=new MemoryStream(Convert.FromBase64String(image.Substring(image.IndexOf(',')+1))))using(var b=new Bitmap(stream))return new Bitmap(b);}
}
