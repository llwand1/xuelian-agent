using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class StudyInviteSmoke
{
    private static int checks;
    private static void Check(bool ok,string message){if(!ok)throw new Exception(message);checks++;Console.WriteLine("PASS "+message);}
    [STAThread] private static int Main(string[] args)
    {
        try
        {
            Assembly assembly=Assembly.LoadFrom(args[0]);Type type=assembly.GetType("DesktopStudyInvite",true);
            BindingFlags statics=BindingFlags.Static|BindingFlags.NonPublic,instances=BindingFlags.Instance|BindingFlags.NonPublic;
            MethodInfo place=type.GetMethod("Place",statics),elements=type.GetMethod("TextElements",statics);
            foreach(float scale in new[]{1f,1.25f,1.5f,2f})foreach(Rectangle work in new[]{new Rectangle(0,0,1920,1080),new Rectangle(-1920,-100,1920,1080)})
            {
                Size size=new Size((int)(292*scale),(int)(166*scale));
                foreach(Point point in new[]{work.Location,new Point(work.Right-64,work.Bottom-64),new Point(work.Left+600,work.Top+300)})
                {
                    Rectangle result=(Rectangle)place.Invoke(null,new object[]{new Rectangle(point,new Size(64,64)),size,work,8});
                    Check(work.Contains(result),"Speech balloon stays within work area at DPI "+scale);
                }
            }
            string[] unicode=(string[])elements.Invoke(null,new object[]{"题🪄e\u0301"});
            Check(unicode.Length==3&&unicode[1]=="🪄"&&unicode[2]=="e\u0301","Typewriter keeps emoji and combining marks intact");
            using(Form ball=new Form())
            {
                ConstructorInfo constructor=type.GetConstructors(instances)[0];
                using(Form invite=(Form)constructor.Invoke(new object[]{ball,"JavaScript 闭包",false,new Func<bool>(()=>false),new Action(()=>{}),new Action(()=>{}),1f}))
                {
                    Check((bool)type.GetProperty("ShowWithoutActivation",instances).GetValue(invite,null),"Invitation does not activate on show");
                    Check(invite.AccessibleName.Contains("快来挑战"),"Complete invitation is available to accessibility tools");
                    Check(invite.Controls.Count==2&&invite.Controls[0].AccessibleName=="挑战一下","Explicit challenge and snooze buttons are present");
                    type.GetMethod("SetSnoozeMinutes",instances).Invoke(invite,new object[]{17});
                    Check(invite.Controls[1].AccessibleName.Contains("17")&&!invite.AccessibleDescription.Contains("两分钟"),"Custom snooze replaces the hard-coded two-minute action and accessibility text");
                    Check(!invite.Visible,"Constructing an invitation never opens the quiz or a visible window");
                    type.GetMethod("SetReduced",instances).Invoke(invite,new object[]{true});
                    Check((bool)type.GetField("reduced",instances).GetValue(invite),"Reduced motion uses complete static text");
                    type.GetMethod("SetTaskCaption",instances).Invoke(invite,new object[]{"AI提醒：今日8/20题，还差12题。先做下一题吧。"});
                    Check(invite.AccessibleName.Contains("8/20")&&invite.Controls[0].AccessibleName=="去做题"&&invite.Controls[1].AccessibleName=="十分钟后","Daily task balloon shows actual progress and task-specific actions");
                    Check(invite.Height==202&&!invite.Visible,"Task caption fits an enlarged non-activating balloon");
                    type.GetMethod("SetGuideCaption",instances).Invoke(invite,new object[]{"引路灯：刚学完，来检验一下？"});
                    Check(invite.Controls[0].AccessibleName=="打开引路灯"&&invite.Controls[1].AccessibleName=="十分钟后","Guide balloon uses guide-specific actions, not quiz launch");
                    if(args.Length>1)
                    {
                        Directory.CreateDirectory(args[1]);type.GetMethod("SetReduced",instances).Invoke(invite,new object[]{false});
                        invite.Location=new Point(-32000,-32000);invite.Show();Application.DoEvents();
                        for(int frame=0;frame<24;frame++)
                        {
                            type.GetField("frame",instances).SetValue(invite,frame);
                            using(Bitmap bitmap=new Bitmap(invite.Width,invite.Height)){invite.DrawToBitmap(bitmap,new Rectangle(Point.Empty,invite.Size));bitmap.Save(Path.Combine(args[1],"invite-"+frame.ToString("00")+".png"),ImageFormat.Png);}
                        }
                    }
                }
            }
            Type launcher=assembly.GetType("Launcher",true);
            FieldInfo ballField=launcher.GetField("BallWindow",statics),inviteField=launcher.GetField("StudyInvite",statics);
            MethodInfo handle=launcher.GetMethod("HandleStudyInvite",statics),close=launcher.GetMethod("CloseStudyInvite",statics);
            using(Form ball=new Form())
            {
                ballField.SetValue(null,ball);
                handle.Invoke(null,new object[]{"{\"id\":\"silent\",\"topic\":\"数学\",\"reducedMotion\":true}"});
                Check(inviteField.GetValue(null)==null,"Background legacy invitation cannot create an unsolicited balloon");
                string payload="{\"id\":\"manual\",\"topic\":\"数学\",\"reducedMotion\":true,\"manual\":true,\"snoozeMinutes\":17}";
                handle.Invoke(null,new object[]{payload});
                Form manual=(Form)inviteField.GetValue(null);
                Check(manual!=null&&manual.Controls.Count==3&&manual.Controls[2].AccessibleName=="收起学习来信","Menu-opened mail has an explicit close action");
                Check(!manual.Visible&&manual.Controls[1].AccessibleName.Contains("17"),"Hidden companion cannot surface mail; custom timing reaches native controls");
                close.Invoke(null,new object[0]);handle.Invoke(null,new object[]{payload});
                Check(inviteField.GetValue(null)!=null,"The same pending mail can be reopened after closing");
                close.Invoke(null,new object[0]);ballField.SetValue(null,null);
            }
            Console.WriteLine("Native invitation assertions: "+checks);return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error.ToString());return 1;}
    }
}
