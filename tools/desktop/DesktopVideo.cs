using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class VideoFrameBounds
{
    internal static Rectangle Crop(RectangleF box, SizeF viewport, Size pixels)
    {
        if(viewport.Width<2||viewport.Height<2||box.Width<2||box.Height<2||box.X<0||box.Y<0||box.Right>viewport.Width+1||box.Bottom>viewport.Height+1||pixels.Width<2||pixels.Height<2||(long)pixels.Width*pixels.Height>40000000)throw new ArgumentException("请先让整个播放器进入可见区域。");
        double sx=pixels.Width/(double)viewport.Width,sy=pixels.Height/(double)viewport.Height;
        if(Math.Abs(sx/sy-1)>.05)throw new ArgumentException("窗口尺寸正在变化，请稍后重新截图。");
        Rectangle result=Rectangle.FromLTRB((int)Math.Floor(box.Left*sx),(int)Math.Floor(box.Top*sy),(int)Math.Ceiling(box.Right*sx),(int)Math.Ceiling(box.Bottom*sy));
        return Rectangle.Intersect(new Rectangle(Point.Empty,pixels),result);
    }
}
internal static partial class Launcher
{
    private static readonly HashSet<WebView2> VideoCaptures=new HashSet<WebView2>();
    private static async void CaptureVideoFrame(WebView2 view,string payload)
    {
        if(payload==null||payload.Length>2048)return;
        if(view==null||view.IsDisposed||view.CoreWebView2==null||VideoCaptures.Contains(view))return;
        string id=null;
        try
        {
            var request=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(payload);
            if(request==null||request.Count!=7||!request.ContainsKey("id"))return;
            id=request["id"] as string;
            if(id==null||!System.Text.RegularExpressions.Regex.IsMatch(id,"^[a-zA-Z0-9_-]{1,80}$"))return;
            VideoCaptures.Add(view);
            string data=await CaptureVideoFrameDataAsync(view,id);
            if(!view.IsDisposed&&view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsString("sb-video:frame-result:"+data);
        }
        catch(Exception)
        {
            if(id!=null&&!view.IsDisposed&&view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsString("sb-video:frame-result:"+new JavaScriptSerializer().Serialize(new{id=id,error="当前视频画面未截取成功，请确认播放器可见后重试。"}));
        }
        finally {VideoCaptures.Remove(view);}
    }
    internal static async Task<string> CaptureVideoFrameDataAsync(WebView2 view,string id)
    {
        if(!System.Text.RegularExpressions.Regex.IsMatch(id,"^[a-zA-Z0-9_-]{1,80}$"))throw new ArgumentException("Invalid capture id");
        string script="(()=>{const f=document.querySelector('iframe[data-sb-video-capture=\""+id+"\"]');if(!f)return null;const r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})()";
        string bounds=await view.CoreWebView2.ExecuteScriptAsync(script);
        var b=new JavaScriptSerializer().Deserialize<Dictionary<string,double>>(bounds);
        if(b==null||b.Count!=6)throw new ArgumentException("Player no longer visible");
        foreach(double value in b.Values)if(Double.IsNaN(value)||Double.IsInfinity(value)||Math.Abs(value)>20000)throw new ArgumentException("Invalid viewport");
        using(MemoryStream bytes=new MemoryStream())
        {
            await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,bytes);
            if(bytes.Length>24000000)throw new InvalidOperationException("Viewport too large");
            bytes.Position=0;
            using(Bitmap whole=new Bitmap(bytes))
            {
                Rectangle crop=VideoFrameBounds.Crop(new RectangleF((float)b["x"],(float)b["y"],(float)b["width"],(float)b["height"]),new SizeF((float)b["viewportWidth"],(float)b["viewportHeight"]),whole.Size);
                using(Bitmap player=DesktopCaptureEncoding.Crop(whole,crop))
                {
                    Size size;string image=DesktopCaptureEncoding.Encode(player,out size);
                    var json=new JavaScriptSerializer();json.MaxJsonLength=6000000;
                    return json.Serialize(new{id=id,dataUrl=image,name="视频画面-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+(image.StartsWith("data:image/png")?".png":".jpg"),width=size.Width,height=size.Height});
                }
            }
        }
    }
}
